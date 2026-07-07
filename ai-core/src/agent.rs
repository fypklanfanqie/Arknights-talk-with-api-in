use std::collections::HashMap;
use std::sync::Arc;
use futures::StreamExt;
use serde_json::Value;
use tokio::sync::{broadcast, mpsc, RwLock};
use uuid::Uuid;

use crate::config::{AgentConfig, ChatMode};
use crate::context::{AgentContext, AgentState};
use crate::error::AgentResult;
use crate::interface::input::{UserAction, UserInput};
use crate::interface::output::{BlueprintEvent, ErrorKind, KernelOutput, RiskLevel};
use crate::message::{Message, ToolCall};
use crate::provider::{create_provider, LlmProvider};
use crate::tool::{ToolContext, ToolRegistry};

pub async fn run_agent_loop(
    mut input_rx: mpsc::UnboundedReceiver<UserInput>,
    output_tx: broadcast::Sender<KernelOutput>,
    state: Arc<RwLock<AgentState>>,
    config: Arc<AgentConfig>,
) -> AgentResult<()> {
    let mut ctx = AgentContext::new(config.clone());
    let mut providers: HashMap<String, Box<dyn LlmProvider>> = HashMap::new();
    let tool_registry = build_tool_registry(&config);

    for p_cfg in &config.providers {
        match create_provider(p_cfg) {
            Ok(provider) => {
                providers.insert(p_cfg.id.clone(), provider);
            }
            Err(e) => {
                let msg = format!("failed to create provider '{}': {e}", p_cfg.id);
                tracing::error!("{msg}");
                let _ = output_tx.send(KernelOutput::Error {
                    message: msg,
                    kind: ErrorKind::Fatal,
                });
            }
        }
    }

    if providers.is_empty() {
        let _ = output_tx.send(KernelOutput::Error {
            message: "no providers available — check your api_key and config".into(),
            kind: ErrorKind::Fatal,
        });
        return Ok(());
    }

    let default_provider = config.first_provider_id().to_string();

    // Update initial state
    {
        let mut s = state.write().await;
        s.configured_providers = config.providers.iter().map(|p| p.id.clone()).collect();
        s.configured_tools = tool_registry.list_names();
    }

    loop {
        let input = match input_rx.recv().await {
            Some(i) => i,
            None => break,
        };

        match input {
            UserInput::Message(text) => {
                let _ = output_tx.send(KernelOutput::StreamStart {
                    message_id: Uuid::new_v4(),
                    model: default_provider.clone(),
                });

                match config.agent.default_mode {
                    ChatMode::Single => {
                        handle_single_chat(
                            &text,
                            &default_provider,
                            &providers,
                            &mut ctx,
                            &tool_registry,
                            &output_tx,
                            &config,
                            &state,
                        ).await;
                    }
                    ChatMode::Roundtable => {
                        handle_roundtable(
                            &text,
                            &providers,
                            &config,
                            &mut ctx,
                            &tool_registry,
                            &output_tx,
                            &state,
                        ).await;
                    }
                    ChatMode::Blueprint => {
                        handle_blueprint_chat(
                            &text,
                            &mut ctx,
                            &tool_registry,
                            &output_tx,
                            &config,
                            &state,
                        ).await;
                    }
                }
            }

            UserInput::Action(action) => {
                handle_user_action(action, &mut ctx, &output_tx, &state, &config).await;
            }

            UserInput::ToolApproval { .. } => {
                // Tool approval is handled synchronously within chat loops
                let _ = output_tx.send(KernelOutput::Error {
                    message: "Tool approval should be handled inline".into(),
                    kind: ErrorKind::Recoverable,
                });
            }

            UserInput::BlueprintApproval { .. } => {
                // Blueprint approval is handled within blueprint pipeline
                let _ = output_tx.send(KernelOutput::Error {
                    message: "Blueprint approval should be handled inline".into(),
                    kind: ErrorKind::Recoverable,
                });
            }
        }
    }

    Ok(())
}

async fn handle_single_chat(
    text: &str,
    provider_id: &str,
    providers: &HashMap<String, Box<dyn LlmProvider>>,
    ctx: &mut AgentContext,
    tool_registry: &ToolRegistry,
    output_tx: &broadcast::Sender<KernelOutput>,
    config: &Arc<AgentConfig>,
    state: &Arc<RwLock<AgentState>>,
) {
    let provider = match providers.get(provider_id) {
        Some(p) => p,
        None => {
            let _ = output_tx.send(KernelOutput::Error {
                message: format!("provider '{}' not found", provider_id),
                kind: ErrorKind::Recoverable,
            });
            return;
        }
    };

    {
        let mut s = state.write().await;
        s.is_processing = true;
        s.active_model = Some(provider.model().to_string());
    }

    ctx.push_user(text);

    // Apply provider-specific system prompt if configured
    if let Some(p_cfg) = config.find_provider(provider_id) {
        if let Some(ref prompt) = p_cfg.system_prompt {
            ctx.set_system_prompt(prompt);
        }
    }

    crate::kernel::set_provider_for_tools(provider_id);

    let tool_ctx = make_tool_context(ctx, config);
    let tools_schema = tool_registry.openai_tool_schemas();

    let result = run_chat_with_tools(ctx, provider.as_ref(), tool_registry, &tool_ctx, &tools_schema, output_tx).await;
    emit_stream_result(output_tx, provider.model(), &result);

    {
        let mut s = state.write().await;
        s.is_processing = false;
        s.history_len = ctx.history.len();
    }
}

async fn handle_roundtable(
    text: &str,
    providers: &HashMap<String, Box<dyn LlmProvider>>,
    config: &Arc<AgentConfig>,
    ctx: &mut AgentContext,
    tool_registry: &ToolRegistry,
    output_tx: &broadcast::Sender<KernelOutput>,
    state: &Arc<RwLock<AgentState>>,
) {
    let order: Vec<String> = if config.roundtable.order.is_empty() {
        config.providers.iter().map(|p| p.id.clone()).collect()
    } else {
        config.roundtable.order.clone()
    };

    // Save previous conversation (if any) for cross-round memory
    let saved_history = ctx.history.clone();

    let tools_schema = tool_registry.openai_tool_schemas();
    let mut previous_responses: Vec<(String, String)> = Vec::new(); // (provider_id, content)

    for provider_id in &order {
        let provider = match providers.get(provider_id.as_str()) {
            Some(p) => p,
            None => continue,
        };

        let _ = output_tx.send(KernelOutput::RoundStart {
            model: provider.model().to_string(),
            provider_id: provider_id.clone(),
        });

        // ─── Rebuild clean context for this model ───
        ctx.history.clear();

        // 1. OWN system prompt only (clean identity, no peer noise)
        let my_prompt = sys_prompt_from_cfg(config, provider_id);
        if !my_prompt.is_empty() {
            ctx.history.push(Message::system(my_prompt.trim()));
        }

        // 2. Build a single combined user message with all context
        let mut combined_user = String::new();

        // 2a. Peer awareness: list other team members
        if config.roundtable.share_context {
            let peers: Vec<&String> = order.iter().filter(|id| *id != provider_id).collect();
            if !peers.is_empty() {
                combined_user.push_str("【以下是与你同组协作的其他成员，你必须记住他们的身份：\n");
                for peer_id in &peers {
                    let short = truncate_str(&sys_prompt_from_cfg(config, peer_id), 100);
                    combined_user.push_str(&format!("成员 \"{}\"：{}\n", peer_id, short));
                }
                combined_user.push_str("如果有人问起其他成员，你必须准确说出他们的名字和设定，不准编造。】\n\n");
            }
        }

        // 2b. Previous round's conversation (cross-round memory)
        if !saved_history.is_empty() {
            combined_user.push_str("【以下是上一轮对话的历史记录：\n");
            for msg in &saved_history {
                let role_str = match msg.role {
                    crate::message::Role::System => "系统",
                    crate::message::Role::User => "用户",
                    crate::message::Role::Assistant => "AI",
                    crate::message::Role::Tool => "工具",
                };
                if let Some(ref content) = msg.content {
                    if !content.is_empty() {
                        let short = truncate_str(content, 200);
                        combined_user.push_str(&format!("[{}] {}\n", role_str, short));
                    }
                }
            }
            combined_user.push_str("】\n\n");
        }

        // 2c. Previous models' responses (same round) — supply context, demand novelty
        if config.roundtable.share_context {
            if !previous_responses.is_empty() {
                combined_user.push_str(
                    "【前几位成员已经回答过这个问题。下面是他们的回答。你必须避免重复他们已经说过的内容。\n\
                     请从你的专属角色出发，补充他们没有涉及的角度、细节或方案。如果前人的回答已经覆盖了你的领域，\n\
                     请明确指出你同意哪位的观点，然后深入展开你擅长的部分：】\n"
                );
            }
            for (prev_id, prev_content) in &previous_responses {
                combined_user.push_str(&format!(
                    "成员 \"{}\" 的回答:\n{}\n",
                    prev_id, prev_content
                ));
            }
            if !previous_responses.is_empty() {
                combined_user.push_str("\n");
            }
        }

        // 2d. The actual user question
        combined_user.push_str(&format!("【用户问题】\n{}", text));

        ctx.history.push(Message::user(combined_user));

        let tool_ctx = make_tool_context(ctx, config);

        crate::kernel::set_provider_for_tools(provider_id);

        match run_chat_with_tools(ctx, provider.as_ref(), tool_registry, &tool_ctx, &tools_schema, output_tx).await {
            Ok(msg) => {
                let content = msg.content.clone().unwrap_or_default();
                previous_responses.push((provider_id.clone(), content));
                let _ = output_tx.send(KernelOutput::StreamEnd {
                    message_id: Uuid::new_v4(),
                    model: provider.model().to_string(),
                });
                let _ = output_tx.send(KernelOutput::MessageComplete { message: msg });
            }
            Err(e) => {
                let _ = output_tx.send(KernelOutput::StreamEnd {
                    message_id: Uuid::new_v4(),
                    model: provider.model().to_string(),
                });
                let _ = output_tx.send(KernelOutput::Error {
                    message: format!("{}: {}", provider.model(), e),
                    kind: ErrorKind::Recoverable,
                });
            }
        }

        let _ = output_tx.send(KernelOutput::RoundEnd {
            model: provider.model().to_string(),
            provider_id: provider_id.clone(),
        });
    }

    let _ = output_tx.send(KernelOutput::RoundtableComplete);

    // ─── Save this round's conversation for next round ───
    ctx.history = saved_history;
    ctx.history.push(Message::user(text));
    for (provider_id, content) in &previous_responses {
        ctx.history.push(Message::assistant(format!("[{}]: {}", provider_id, content)));
    }

    {
        let mut s = state.write().await;
        s.is_processing = false;
        s.history_len = ctx.history.len();
    }
}

async fn handle_blueprint_chat(
    _text: &str,
    _ctx: &mut AgentContext,
    _tool_registry: &ToolRegistry,
    output_tx: &broadcast::Sender<KernelOutput>,
    config: &Arc<AgentConfig>,
    state: &Arc<RwLock<AgentState>>,
) {
    let bp_id = Uuid::new_v4();
    {
        let mut s = state.write().await;
        s.active_blueprint = Some(bp_id);
        s.is_processing = true;
    }

    let _ = output_tx.send(KernelOutput::Blueprint(BlueprintEvent::PlanCreated {
        blueprint_id: bp_id,
        task: _text.to_string(),
        stages: vec![
            crate::interface::output::StageInfo {
                name: "planning".into(),
                description: "Analyze task and create implementation plan".into(),
                assignee: config.blueprint.architect.clone().unwrap_or_default(),
            },
            crate::interface::output::StageInfo {
                name: "writing".into(),
                description: "Generate code for each file".into(),
                assignee: config.blueprint.workers.first().map(|w| w.provider.clone()).unwrap_or_default(),
            },
            crate::interface::output::StageInfo {
                name: "review".into(),
                description: "Review generated code".into(),
                assignee: config.blueprint.reviewer.clone().unwrap_or_default(),
            },
        ],
    }));

    let _ = output_tx.send(KernelOutput::Blueprint(BlueprintEvent::BlueprintCompleted {
        files_changed: vec![],
    }));

    {
        let mut s = state.write().await;
        s.is_processing = false;
        s.active_blueprint = None;
    }
}

pub(crate) async fn run_chat_loop(
    ctx: &mut AgentContext,
    provider: &dyn LlmProvider,
    tool_registry: &ToolRegistry,
    tool_ctx: &ToolContext,
    tools_schema: Option<&[Value]>,
    mut on_text: impl FnMut(&str),
    mut on_tool_start: impl FnMut(&str, &str),
    mut on_tool_end: impl FnMut(&str, bool, &str),
    mut on_permission: impl FnMut(&str, &str, RiskLevel),
) -> AgentResult<Message> {
    let max_iterations = 10;
    let mut iterations = 0;

    loop {
        if iterations >= max_iterations {
            break;
        }
        iterations += 1;

        let mut stream = provider.chat(&ctx.history, tools_schema).await?;

        let mut full_content = String::new();
        let mut pending_tool_calls: Vec<ToolCall> = Vec::new();
        let mut current_tool = ToolCallDraft::default();

        while let Some(chunk) = stream.next().await {
            match chunk? {
                crate::message::LlmChunk::TextDelta { content } => {
                    on_text(&content);
                    full_content.push_str(&content);
                }
                crate::message::LlmChunk::ToolCallDelta { id, name, arguments } => {
                    if !id.is_empty() && current_tool.id.is_empty() {
                        current_tool.id = id;
                    }
                    if let Some(n) = name {
                        current_tool.name = n;
                    }
                    if let Some(a) = arguments {
                        current_tool.args.push_str(&a);
                    }
                }
                crate::message::LlmChunk::Finished { .. } => {
                    if !current_tool.id.is_empty() && !current_tool.name.is_empty() {
                        pending_tool_calls.push(ToolCall {
                            id: current_tool.id.clone(),
                            call_type: "function".into(),
                            function: crate::message::FunctionCall {
                                name: current_tool.name.clone(),
                                arguments: current_tool.args.clone(),
                            },
                        });
                        current_tool = ToolCallDraft::default();
                    }
                    break;
                }
            }
        }

        if pending_tool_calls.is_empty() {
            let msg = if full_content.is_empty() {
                Message::assistant("(no response)".to_string())
            } else {
                Message::assistant(full_content)
            };
            ctx.history.push(msg.clone());
            return Ok(msg);
        }

        let mut tool_results = Vec::new();
        for tc in &pending_tool_calls {
            let args_preview = truncate_str(&tc.function.arguments, 100);
            on_tool_start(&tc.function.name, &args_preview);

            let tool_name = &tc.function.name;
            let args: Value = match serde_json::from_str(&tc.function.arguments) {
                Ok(v) => v,
                Err(e) => {
                    let err = format!("invalid JSON args: {e}");
                    on_tool_end(tool_name, false, &err);
                    tool_results.push((tc.clone(), err));
                    continue;
                }
            };

            let risk = tool_risk_level(tool_name);
            if risk != RiskLevel::Low {
                on_permission(&tc.id, tool_name, risk);
            }

            match tool_registry.execute(tool_name, args, tool_ctx).await {
                Ok(result) => {
                    let preview = truncate_str(&result, 200);
                    on_tool_end(tool_name, true, &preview);
                    tool_results.push((tc.clone(), result));
                }
                Err(e) => {
                    let err = format!("tool error: {e}");
                    on_tool_end(tool_name, false, &err);
                    tool_results.push((tc.clone(), err));
                }
            }
        }

        ctx.history.push(Message::assistant_with_tools(pending_tool_calls.clone()));
        for (tc, result) in &tool_results {
            ctx.push_tool(&tc.id, &tc.function.name, result);
        }
        if tool_results.is_empty() {
            break;
        }
    }

    Ok(Message::assistant("completed"))
}

async fn run_chat_with_tools(
    ctx: &mut AgentContext,
    provider: &dyn LlmProvider,
    tool_registry: &ToolRegistry,
    tool_ctx: &ToolContext,
    tools_schema: &[Value],
    output_tx: &broadcast::Sender<KernelOutput>,
) -> AgentResult<Message> {
    let schemas: Option<&[Value]> = if tools_schema.is_empty() { None } else { Some(tools_schema) };
    let model = provider.model().to_string();
    let msg_id = Uuid::new_v4();
    run_chat_loop(
        ctx, provider, tool_registry, tool_ctx, schemas,
        |text| {
            let _ = output_tx.send(KernelOutput::TextDelta {
                message_id: msg_id,
                content: text.to_string(),
                model: model.clone(),
            });
        },
        |name, preview| {
            let _ = output_tx.send(KernelOutput::ToolCallStart {
                call_id: String::new(),
                tool_name: name.to_string(),
                args_preview: preview.to_string(),
            });
        },
        |name, ok, preview| {
            let _ = output_tx.send(KernelOutput::ToolCallEnd {
                call_id: String::new(),
                tool_name: name.to_string(),
                succeeded: ok,
                output_preview: preview.to_string(),
            });
        },
        |call_id, name, risk| {
            let _ = output_tx.send(KernelOutput::PermissionRequest {
                call_id: call_id.to_string(),
                tool_name: name.to_string(),
                args_preview: "...".into(),
                risk_level: risk,
            });
        },
    ).await
}

fn emit_stream_result(
    output_tx: &broadcast::Sender<KernelOutput>,
    model: &str,
    result: &AgentResult<Message>,
) {
    let _ = output_tx.send(KernelOutput::StreamEnd {
        message_id: Uuid::new_v4(),
        model: model.to_string(),
    });
    match result {
        Ok(msg) => {
            let _ = output_tx.send(KernelOutput::MessageComplete { message: msg.clone() });
        }
        Err(e) => {
            let _ = output_tx.send(KernelOutput::Error {
                message: e.to_string(),
                kind: ErrorKind::Recoverable,
            });
        }
    }
}

async fn handle_user_action(
    action: UserAction,
    ctx: &mut AgentContext,
    output_tx: &broadcast::Sender<KernelOutput>,
    state: &Arc<RwLock<AgentState>>,
    config: &Arc<AgentConfig>,
) {
    match action {
        UserAction::Cancel => {
            let _ = output_tx.send(KernelOutput::Error {
                message: "cancelled".into(),
                kind: ErrorKind::Recoverable,
            });
        }
        UserAction::Retry => {
            // Not implemented in v0.1
        }
        UserAction::ClearHistory => {
            ctx.reset_history();
            {
                let mut s = state.write().await;
                s.history_len = 0;
            }
            let _ = output_tx.send(KernelOutput::StatusChanged(state.read().await.clone()));
        }
        UserAction::SwitchModel(provider_id) => {
            if config.find_provider(&provider_id).is_some() {
                let mut s = state.write().await;
                s.active_model = Some(provider_id.clone());
            }
        }
        UserAction::ToggleMode(mode) => {
            let mut s = state.write().await;
            s.active_mode = mode;
            let _ = output_tx.send(KernelOutput::StatusChanged(s.clone()));
        }
        UserAction::ShowStatus => {
            let _ = output_tx.send(KernelOutput::StatusChanged(state.read().await.clone()));
        }
        UserAction::ShowHistory => {
            for msg in &ctx.history {
                let content = msg.content.as_deref().unwrap_or("(tool call)");
                let _ = output_tx.send(KernelOutput::TextDelta {
                    message_id: msg.id,
                    content: format!("[{}] {}\n", format!("{:?}", msg.role).to_lowercase(), content),
                    model: "system".into(),
                });
            }
        }
        UserAction::Quit => {
            std::process::exit(0);
        }
        UserAction::ExportSession(format_str) => {
            let fmt = crate::export::ExportFormat::from_str(&format_str)
                .unwrap_or_default();
            let models: Vec<String> = config.providers.iter().map(|p| p.id.clone()).collect();
            let content = crate::export::format_history(&ctx.history, fmt, &models);
            let _ = output_tx.send(KernelOutput::SessionExported { content, format: fmt });
        }
        UserAction::SaveSession(id) => {
            let sid = if id.is_empty() { crate::session::SessionStore::auto_id() } else { id };
            let models: Vec<String> = config.providers.iter().map(|p| p.id.clone()).collect();
            let session = crate::session::Session {
                id: sid.clone(),
                topic: String::new(),
                created_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                model_ids: models,
                messages: ctx.history.clone(),
            };
            match crate::session::SessionStore::default_dir() {
                Some(dir) => {
                    let store = crate::session::SessionStore::new(dir);
                    match store.save(&session) {
                        Ok(_) => { let _ = output_tx.send(KernelOutput::SessionSaved { id: sid }); }
                        Err(e) => { let _ = output_tx.send(KernelOutput::Error { message: format!("save failed: {e}"), kind: ErrorKind::Recoverable }); }
                    }
                }
                None => { let _ = output_tx.send(KernelOutput::Error { message: "no config dir".into(), kind: ErrorKind::Recoverable }); }
            }
        }
        UserAction::LoadSession(id) => {
            match crate::session::SessionStore::default_dir() {
                Some(dir) => {
                    let store = crate::session::SessionStore::new(dir);
                    match store.load(&id) {
                        Ok(session) => {
                            ctx.reset_history();
                            ctx.history = session.messages;
                            let _ = output_tx.send(KernelOutput::SessionLoaded { id, message_count: ctx.history.len() });
                        }
                        Err(e) => { let _ = output_tx.send(KernelOutput::Error { message: format!("load failed: {e}"), kind: ErrorKind::Recoverable }); }
                    }
                }
                None => { let _ = output_tx.send(KernelOutput::Error { message: "no config dir".into(), kind: ErrorKind::Recoverable }); }
            }
        }
        UserAction::ListSessions => {
            match crate::session::SessionStore::default_dir() {
                Some(dir) => {
                    let store = crate::session::SessionStore::new(dir);
                    match store.list() {
                        Ok(sessions) => { let _ = output_tx.send(KernelOutput::SessionList { sessions }); }
                        Err(e) => { let _ = output_tx.send(KernelOutput::Error { message: format!("list failed: {e}"), kind: ErrorKind::Recoverable }); }
                    }
                }
                None => { let _ = output_tx.send(KernelOutput::Error { message: "no config dir".into(), kind: ErrorKind::Recoverable }); }
            }
        }
        _ => {}
    }
}

fn build_tool_registry(config: &AgentConfig) -> ToolRegistry {
    use crate::tool::builtin::bash::BashTool;
    use crate::tool::builtin::glob::GlobTool;
    use crate::tool::builtin::grep::GrepTool;
    use crate::tool::builtin::read_file::ReadFileTool;
    use crate::tool::builtin::write_file::WriteFileTool;

    let mut registry = ToolRegistry::new();

    if config.tools.read_enabled {
        registry.register(ReadFileTool);
    }
    if config.tools.write_enabled {
        registry.register(WriteFileTool);
    }
    if config.tools.grep_enabled {
        registry.register(GrepTool);
    }
    if config.tools.glob_enabled {
        registry.register(GlobTool);
    }
    if config.tools.bash_enabled {
        registry.register(BashTool);
    }

    let cap_names = config.enabled_capability_names();
    for tool in crate::kernel::tools_for(&cap_names) {
        registry.register_arc(tool);
    }

    registry
}

fn make_tool_context(ctx: &AgentContext, _config: &Arc<AgentConfig>) -> ToolContext {
    ctx.tool_context()
}

fn tool_risk_level(tool_name: &str) -> RiskLevel {
    match tool_name {
        "read_file" | "grep" | "glob" => RiskLevel::Low,
        "write_file" => RiskLevel::Medium,
        "bash" => RiskLevel::High,
        _ => RiskLevel::Medium,
    }
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(max_len).collect::<String>())
    }
}

fn sys_prompt_from_cfg(config: &AgentConfig, provider_id: &str) -> String {
    config
        .find_provider(provider_id)
        .and_then(|p| p.system_prompt.clone())
        .unwrap_or_else(|| config.agent.system_prompt.clone())
}

#[derive(Default)]
struct ToolCallDraft {
    id: String,
    name: String,
    args: String,
}
