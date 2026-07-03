use crate::context::AgentState;
use crate::export::ExportFormat;
use crate::message::Message;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub enum KernelOutput {
    // ─── streaming ───
    StreamStart {
        message_id: Uuid,
        model: String,
    },
    TextDelta {
        message_id: Uuid,
        content: String,
        model: String,
    },
    StreamEnd {
        message_id: Uuid,
        model: String,
    },

    // ─── roundtable ───
    RoundStart {
        model: String,
        provider_id: String,
    },
    RoundEnd {
        model: String,
        provider_id: String,
    },
    RoundtableComplete,

    // ─── structured message ───
    MessageComplete {
        message: Message,
    },

    // ─── tool interaction ───
    PermissionRequest {
        call_id: String,
        tool_name: String,
        args_preview: String,
        risk_level: RiskLevel,
    },
    ToolCallStart {
        call_id: String,
        tool_name: String,
        args_preview: String,
    },
    ToolCallEnd {
        call_id: String,
        tool_name: String,
        succeeded: bool,
        output_preview: String,
    },

    // ─── blueprint ───
    Blueprint(BlueprintEvent),

    // ─── state ───
    StatusChanged(AgentState),

    // ─── session export ───
    SessionExported {
        content: String,
        format: ExportFormat,
    },

    // ─── session persistence ───
    SessionSaved {
        id: String,
    },
    SessionLoaded {
        id: String,
        message_count: usize,
    },
    SessionList {
        sessions: Vec<crate::session::SessionMeta>,
    },
    SessionDeleted {
        id: String,
    },

    // ─── errors ───
    Error {
        message: String,
        kind: ErrorKind,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone)]
pub enum ErrorKind {
    Recoverable,
    Fatal,
}

#[derive(Debug, Clone)]
pub enum BlueprintEvent {
    PlanCreated {
        blueprint_id: Uuid,
        task: String,
        stages: Vec<StageInfo>,
    },
    StageStarted {
        stage: String,
        assignee: String,
    },
    DraftFileUpdated {
        file: String,
        content_snippet: String,
        author: String,
    },
    ReviewComment {
        file: String,
        comment: String,
        reviewer: String,
    },
    DiffPreview {
        file: String,
        diff: String,
    },
    StageCompleted {
        stage: String,
    },
    BlueprintCompleted {
        files_changed: Vec<String>,
    },
    BlueprintFailed {
        stage: String,
        error: String,
    },
}

#[derive(Debug, Clone)]
pub struct StageInfo {
    pub name: String,
    pub description: String,
    pub assignee: String,
}
