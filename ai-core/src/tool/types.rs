use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone)]
pub struct ToolContext {
    pub working_dir: PathBuf,
    pub allow_paths: Vec<PathBuf>,
    pub deny_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct ToolResult {
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
}

impl ToolResult {
    pub fn ok(content: impl Into<String>) -> Self {
        Self { success: true, content: content.into(), error: None }
    }

    pub fn err(error: impl Into<String>) -> Self {
        Self { success: false, content: String::new(), error: Some(error.into()) }
    }
}
