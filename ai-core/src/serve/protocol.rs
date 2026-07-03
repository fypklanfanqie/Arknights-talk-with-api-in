use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Request {
    Think {
        #[serde(default)]
        agent: Option<String>,
        prompt: String,
    },
    LoadConfig {
        path: String,
    },
    SaveSession {
        #[serde(default)]
        id: Option<String>,
    },
    LoadSession {
        id: String,
    },
    ListSessions,
    ClearHistory,
    ListAgents,
    Quit,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    TextDelta {
        agent_id: String,
        content: String,
    },
    ToolCallStart {
        agent_id: String,
        tool_name: String,
        args_preview: String,
    },
    ToolCallEnd {
        agent_id: String,
        tool_name: String,
        succeeded: bool,
        output_preview: String,
    },
    AgentThinking {
        agent_id: String,
    },
    AgentFinished {
        agent_id: String,
        content: String,
    },
    ThinkComplete,
    SessionSaved {
        id: String,
    },
    SessionLoaded {
        id: String,
        message_count: usize,
    },
    SessionList {
        sessions: Vec<SessionMeta>,
    },
    Error {
        message: String,
    },
    Bye,
}

#[derive(Debug, Serialize)]
pub struct SessionMeta {
    pub id: String,
    pub topic: String,
    pub message_count: usize,
}

impl From<crate::session::SessionMeta> for SessionMeta {
    fn from(m: crate::session::SessionMeta) -> Self {
        Self { id: m.id, topic: m.topic, message_count: m.message_count }
    }
}
