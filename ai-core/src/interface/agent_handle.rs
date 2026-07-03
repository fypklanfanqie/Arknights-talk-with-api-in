use crate::config::AgentConfig;
use crate::context::AgentState;
use crate::error::AgentError;
use crate::interface::input::{UserAction, UserInput};
use crate::interface::output::KernelOutput;
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, RwLock};
use uuid::Uuid;

const CHANNEL_CAPACITY: usize = 256;

pub struct AgentHandle {
    input_tx: mpsc::UnboundedSender<UserInput>,
    output_rx: broadcast::Receiver<KernelOutput>,
    output_tx_backup: broadcast::Sender<KernelOutput>,
    state: Arc<RwLock<AgentState>>,
    _config: Arc<AgentConfig>,
}

impl AgentHandle {
    pub async fn spawn(config: AgentConfig) -> Result<Self, AgentError> {
        let config = Arc::new(config);
        let (input_tx, input_rx) = mpsc::unbounded_channel();
        let (output_tx, output_rx) = broadcast::channel(CHANNEL_CAPACITY);

        let state = Arc::new(RwLock::new(AgentState {
            active_model: None,
            active_blueprint: None,
            history_len: 0,
            token_count: 0,
            configured_providers: config.providers.iter().map(|p| p.id.clone()).collect(),
            configured_tools: vec!["read_file", "write_file", "grep", "glob"]
                .into_iter()
                .map(String::from)
                .collect(),
            mcp_servers: config.mcp_servers.iter().map(|m| m.name.clone()).collect(),
            is_processing: false,
            last_error: None,
            active_mode: config.agent.default_mode,
        }));

        let output_tx_agent = output_tx.clone();
        let state_agent = state.clone();
        let cfg_agent = config.clone();

        tokio::spawn(async move {
            if let Err(e) = crate::agent::run_agent_loop(
                input_rx,
                output_tx_agent,
                state_agent,
                cfg_agent,
            )
            .await
            {
                tracing::error!("agent loop died: {e}");
            }
        });

        Ok(Self {
            input_tx,
            output_rx,
            output_tx_backup: output_tx,
            state,
            _config: config,
        })
    }

    // ─── Input ───

    pub fn send_message(&self, text: &str) -> Result<(), AgentError> {
        self.input_tx
            .send(UserInput::Message(text.to_owned()))
            .map_err(|e| AgentError::Recoverable(format!("channel closed: {e}")))
    }

    pub fn send_action(&self, action: UserAction) -> Result<(), AgentError> {
        self.input_tx
            .send(UserInput::Action(action))
            .map_err(|e| AgentError::Recoverable(format!("channel closed: {e}")))
    }

    pub fn respond_permission(&self, call_id: &str, approved: bool) -> Result<(), AgentError> {
        self.input_tx
            .send(UserInput::ToolApproval {
                call_id: call_id.to_owned(),
                approved,
            })
            .map_err(|e| AgentError::Recoverable(format!("channel closed: {e}")))
    }

    pub fn respond_blueprint(&self, blueprint_id: Uuid, approved: bool) -> Result<(), AgentError> {
        self.input_tx
            .send(UserInput::BlueprintApproval {
                blueprint_id,
                approved,
            })
            .map_err(|e| AgentError::Recoverable(format!("channel closed: {e}")))
    }

    // ─── Output ───

    pub fn subscribe(&self) -> broadcast::Receiver<KernelOutput> {
        self.output_tx_backup.subscribe()
    }

    pub async fn recv(&mut self) -> Result<KernelOutput, AgentError> {
        self.output_rx
            .recv()
            .await
            .map_err(|e| AgentError::Recoverable(format!("recv error: {e}")))
    }

    pub async fn drain_output(&mut self) -> Vec<KernelOutput> {
        let mut buf = VecDeque::new();
        loop {
            match self.output_rx.try_recv() {
                Ok(event) => buf.push_back(event),
                Err(broadcast::error::TryRecvError::Empty) => break,
                Err(broadcast::error::TryRecvError::Lagged(n)) => {
                    tracing::warn!("output receiver lagged by {n}");
                    break;
                }
                Err(broadcast::error::TryRecvError::Closed) => break,
            }
        }
        buf.into()
    }

    // ─── State ───

    pub async fn state(&self) -> AgentState {
        self.state.read().await.clone()
    }

    // ─── Lifecycle ──

    pub fn shutdown(self) {
        drop(self.input_tx);
        drop(self.output_tx_backup);
    }
}
