use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub enum UserInput {
    Message(String),

    Action(UserAction),

    ToolApproval {
        call_id: String,
        approved: bool,
    },

    BlueprintApproval {
        blueprint_id: Uuid,
        approved: bool,
    },
}

#[derive(Debug, Clone)]
pub enum UserAction {
    Cancel,
    Retry,
    ClearHistory,
    SwitchModel(String),
    ToggleMode(crate::config::ChatMode),
    SaveConfig,
    ReloadConfig,
    ShowStatus,
    ShowHistory,
    Interrupt,
    ExportSession(String),
    SaveSession(String),      // session id (empty = auto)
    LoadSession(String),       // session id
    ListSessions,
    Quit,

    Custom {
        name: String,
        payload: Value,
    },
}
