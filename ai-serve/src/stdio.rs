use std::io::Write;

use anyhow::Context;
use tokio::io::{AsyncBufReadExt, BufReader};

use ai_core::config::AgentConfig;
use ai_core::interface::agent_handle::AgentHandle;
use ai_core::interface::input::UserAction;
use ai_core::interface::output::KernelOutput;
use ai_core::serve::protocol::{Event, Request};

use crate::protocol::{event_to_json, kernel_to_event};

pub async fn run_stdio() -> anyhow::Result<()> {
    let config = AgentConfig::load().context("failed to load config")?;
    let mut agent = AgentHandle::spawn(config).await?;

    eprintln!("[ai-serve] ready (stdio)");

    let mut stdin = BufReader::new(tokio::io::stdin()).lines();

    while let Some(line) = stdin.next_line().await.context("stdin closed")? {
        let req: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                emit_stdout(&Event::Error { message: format!("invalid request: {e}") });
                continue;
            }
        };

        match req {
            Request::Think { agent: _, prompt } => {
                agent.send_message(&prompt)?;
                loop {
                    let out = agent.recv().await.context("agent channel closed")?;
                    let done = matches!(out, KernelOutput::MessageComplete { .. } | KernelOutput::Error { .. });
                    if let Some(evt) = kernel_to_event(out) {
                        emit_stdout(&evt);
                    }
                    if done {
                        break;
                    }
                }
            }
            Request::SaveSession { id } => {
                agent.send_action(UserAction::SaveSession(id.unwrap_or_default()))?;
                drain_stdio(&mut agent).await?;
            }
            Request::LoadSession { id } => {
                agent.send_action(UserAction::LoadSession(id))?;
                drain_stdio(&mut agent).await?;
            }
            Request::ListSessions => {
                agent.send_action(UserAction::ListSessions)?;
                drain_stdio(&mut agent).await?;
            }
            Request::ClearHistory => {
                agent.send_action(UserAction::ClearHistory)?;
            }
            Request::ListAgents => {
                emit_stdout(&Event::Error { message: "list_agents not available in AgentHandle mode".into() });
            }
            Request::LoadConfig { path: _ } => {
                emit_stdout(&Event::Error { message: "hot reload not supported — restart ai-serve".into() });
            }
            Request::Quit => {
                emit_stdout(&Event::Bye);
                agent.shutdown();
                break;
            }
        }
    }
    Ok(())
}

fn emit_stdout(event: &Event) {
    let buf = event_to_json(event);
    let _ = std::io::stdout().write_all(buf.as_bytes());
    let _ = std::io::stdout().flush();
}

async fn drain_stdio(agent: &mut AgentHandle) -> anyhow::Result<()> {
    loop {
        let out = agent.recv().await?;
        let done = matches!(out, KernelOutput::SessionSaved { .. } | KernelOutput::SessionLoaded { .. } | KernelOutput::SessionList { .. } | KernelOutput::Error { .. });
        if let Some(evt) = kernel_to_event(out) {
            emit_stdout(&evt);
        }
        if done {
            break;
        }
    }
    Ok(())
}
