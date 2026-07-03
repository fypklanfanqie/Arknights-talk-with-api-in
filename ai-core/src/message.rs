use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    pub role: Role,
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone)]
pub enum LlmChunk {
    TextDelta {
        content: String,
    },
    ToolCallDelta {
        id: String,
        name: Option<String>,
        arguments: Option<String>,
    },
    Finished {
        reason: String,
        usage: Option<Usage>,
    },
}

#[derive(Debug, Clone)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

impl Message {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            role: Role::System,
            content: Some(content.into()),
            tool_calls: vec![],
            tool_call_id: None,
            name: None,
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            role: Role::User,
            content: Some(content.into()),
            tool_calls: vec![],
            tool_call_id: None,
            name: None,
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            role: Role::Assistant,
            content: Some(content.into()),
            tool_calls: vec![],
            tool_call_id: None,
            name: None,
        }
    }

    pub fn assistant_with_tools(tool_calls: Vec<ToolCall>) -> Self {
        Self {
            id: Uuid::new_v4(),
            role: Role::Assistant,
            content: None,
            tool_calls,
            tool_call_id: None,
            name: None,
        }
    }

    pub fn tool(tool_call_id: impl Into<String>, name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            role: Role::Tool,
            content: Some(content.into()),
            tool_calls: vec![],
            tool_call_id: Some(tool_call_id.into()),
            name: Some(name.into()),
        }
    }
}
