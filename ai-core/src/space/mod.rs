pub mod event;
pub mod tools;
pub mod world;

use std::collections::HashMap;
use std::sync::Arc;

use futures::future::join_all;
use serde_json::Value;
use tokio::sync::{broadcast, Mutex};

use crate::agent::run_chat_loop;
use crate::config::AgentConfig;
use crate::context::AgentContext;
use crate::error::{AgentError, AgentResult};
use crate::kernel;
use crate::provider::{create_provider, LlmProvider};
use crate::tool::{Tool, ToolRegistry};

pub use event::SpaceEvent;
pub use world::WorldRegistry;
use tools::{ReadWorldTool, SpeakTool, WriteWorldTool};

const CHANNEL_CAPACITY: usize = 256;

struct AgentEntry {
    provider: Arc<dyn LlmProvider>,
    context: Arc<Mutex<AgentContext>>,
    system_prompt: String,
    custom_tools: Vec<Arc<dyn Tool>>,
    capability_tools: Vec<Arc<dyn Tool>>,
}

pub struct Space {
    agents: HashMap<String, AgentEntry>,
    worlds: WorldRegistry,
    event_tx: broadcast::Sender<SpaceEvent>,
}

impl Space {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self { agents: HashMap::new(), worlds: WorldRegistry::new(), event_tx: tx }
    }

    pub fn add_agent(&mut self, id: &str, config: AgentConfig) -> AgentResult<()> {
        let p_cfg = config.providers.first()
            .ok_or_else(|| AgentError::Config("agent config must have at least one provider".into()))?;
        let provider = create_provider(p_cfg)?;
        let system_prompt = p_cfg.system_prompt.clone()
            .unwrap_or_else(|| config.agent.system_prompt.clone());
        let capability_tools = kernel::tools_for(&config.enabled_capability_names());
        let agent_ctx = AgentContext::new(Arc::new(config));

        self.agents.insert(id.to_string(), AgentEntry {
            provider: Arc::from(provider),
            context: Arc::new(Mutex::new(agent_ctx)),
            system_prompt,
            custom_tools: Vec::new(),
            capability_tools,
        });
        Ok(())
    }

    pub fn remove_agent(&mut self, id: &str) { self.agents.remove(id); }
    pub fn agents(&self) -> Vec<&str> { self.agents.keys().map(|s| s.as_str()).collect() }

    pub fn register_tool(&mut self, agent_id: &str, tool: Arc<dyn Tool>) -> AgentResult<()> {
        self.agents.get_mut(agent_id)
            .ok_or_else(|| AgentError::Config(format!("agent '{}' not found", agent_id)))?
            .custom_tools.push(tool);
        Ok(())
    }

    pub async fn clear_agent_context(&self, agent_id: &str) -> AgentResult<()> {
        self.agents.get(agent_id)
            .ok_or_else(|| AgentError::Config(format!("agent '{}' not found", agent_id)))?
            .context.lock().await.reset_history();
        Ok(())
    }

    // ── worlds ──
    pub fn worlds(&self) -> &WorldRegistry { &self.worlds }

    // ── events ──
    pub fn subscribe(&self) -> broadcast::Receiver<SpaceEvent> { self.event_tx.subscribe() }

    // ── think ──
    pub async fn think_all(&self, prompt: &str) -> AgentResult<()> {
        self.think_subset_vec(self.agents.keys().cloned().collect(), prompt).await
    }

    pub async fn think_one(&self, agent_id: &str, prompt: &str) -> AgentResult<()> {
        self.think_subset_vec(vec![agent_id.to_string()], prompt).await
    }

    pub async fn think_subset(&self, agent_ids: &[&str], prompt: &str) -> AgentResult<()> {
        self.think_subset_vec(agent_ids.iter().map(|s| s.to_string()).collect(), prompt).await
    }

    async fn think_subset_vec(&self, agent_ids: Vec<String>, prompt: &str) -> AgentResult<()> {
        if agent_ids.is_empty() { return Ok(()); }

        let prompt = prompt.to_string();
        let mut futures = Vec::new();

        for agent_id in &agent_ids {
            let entry = match self.agents.get(agent_id) {
                Some(e) => e,
                None => {
                    let _ = self.event_tx.send(SpaceEvent::AgentError {
                        agent_id: agent_id.clone(),
                        message: format!("agent '{}' not found", agent_id),
                    });
                    continue;
                }
            };

            let id = agent_id.clone();
            let p = prompt.clone();
            let provider = entry.provider.clone();
            let context = entry.context.clone();
            let system_prompt = entry.system_prompt.clone();
            let custom_tools = entry.custom_tools.clone();
            let capability_tools = entry.capability_tools.clone();
            let event_tx = self.event_tx.clone();
            let worlds = self.worlds.clone();

            futures.push(spawn_agent_think(id, provider, context, system_prompt, custom_tools, capability_tools, p, event_tx, worlds));
        }

        join_all(futures).await;
        let _ = self.event_tx.send(SpaceEvent::ThinkComplete);
        Ok(())
    }
}

impl Default for Space {
    fn default() -> Self { Self::new() }
}

// ── internal ──

async fn spawn_agent_think(
    agent_id: String,
    provider: Arc<dyn LlmProvider>,
    context: Arc<Mutex<AgentContext>>,
    system_prompt: String,
    custom_tools: Vec<Arc<dyn Tool>>,
    capability_tools: Vec<Arc<dyn Tool>>,
    prompt: String,
    event_tx: broadcast::Sender<SpaceEvent>,
    worlds: WorldRegistry,
) {
    let _ = event_tx.send(SpaceEvent::AgentThinking { agent_id: agent_id.clone() });

    let mut ctx = context.lock().await;

    let mut tool_registry = ToolRegistry::new();
    tool_registry.register(SpeakTool::new(agent_id.clone(), event_tx.clone()));
    tool_registry.register(ReadWorldTool::new(worlds.clone()));
    tool_registry.register(WriteWorldTool::new(worlds, event_tx.clone()));
    for tool in &custom_tools { tool_registry.register_arc(tool.clone()); }
    for tool in &capability_tools { tool_registry.register_arc(tool.clone()); }

    if !system_prompt.is_empty() { ctx.set_system_prompt(&system_prompt); }
    ctx.push_user(&prompt);

    let tools_schema = tool_registry.openai_tool_schemas();
    let schemas: Option<&[Value]> = if tools_schema.is_empty() { None } else { Some(&tools_schema) };
    let tool_ctx = ctx.tool_context();

    let tx = event_tx.clone();
    let aid = agent_id.clone();
    match run_chat_loop(&mut ctx, provider.as_ref(), &tool_registry, &tool_ctx, schemas,
        |text| { let _ = tx.send(SpaceEvent::TextDelta { agent_id: aid.clone(), content: text.to_string() }); },
        |name, preview| { let _ = tx.send(SpaceEvent::ToolCallStart { agent_id: aid.clone(), tool_name: name.to_string(), args_preview: preview.to_string() }); },
        |name, ok, preview| { let _ = tx.send(SpaceEvent::ToolCallEnd { agent_id: aid.clone(), tool_name: name.to_string(), succeeded: ok, output_preview: preview.to_string() }); },
        |_, _, _| {}, // no permission checks in space mode
    ).await {
        Ok(msg) => {
            let content = msg.content.unwrap_or_default();
            let _ = event_tx.send(SpaceEvent::AgentFinished { agent_id, content });
        }
        Err(e) => {
            let _ = event_tx.send(SpaceEvent::AgentError { agent_id, message: e.to_string() });
        }
    }
}
