use crate::config::ChatMode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    pub active_model: Option<String>,
    pub active_blueprint: Option<Uuid>,
    pub history_len: usize,
    pub token_count: usize,
    pub configured_providers: Vec<String>,
    pub configured_tools: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub is_processing: bool,
    pub last_error: Option<String>,
    pub active_mode: ChatMode,
}
