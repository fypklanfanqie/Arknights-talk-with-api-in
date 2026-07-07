use serde_json::Value;

#[derive(Debug, Clone)]
pub enum SpaceEvent {
    AgentThinking {
        agent_id: String,
    },
    TextDelta {
        agent_id: String,
        content: String,
    },
    AgentFinished {
        agent_id: String,
        content: String,
    },
    AgentSpeech {
        agent_id: String,
        text: String,
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
    StateChanged {
        world: String,
        key: String,
        value: Value,
    },
    AgentError {
        agent_id: String,
        message: String,
    },
    ThinkComplete,
}
