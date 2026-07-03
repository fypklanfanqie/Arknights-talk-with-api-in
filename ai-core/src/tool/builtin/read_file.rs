use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;

use crate::error::AgentResult;
use crate::tool::{Tool, ToolContext, ToolDef};

pub struct ReadFileTool;

#[async_trait]
impl Tool for ReadFileTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "read_file".into(),
            description: "Read the contents of a file at the given path".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to read"
                    }
                },
                "required": ["path"]
            }),
        }
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> AgentResult<String> {
        let path_str = args["path"].as_str().unwrap_or("");
        let path = if Path::new(path_str).is_absolute() {
            Path::new(path_str).to_path_buf()
        } else {
            ctx.working_dir.join(path_str)
        };

        if !is_path_allowed(&path, ctx) {
            return Ok(format!("Error: path '{}' is not allowed", path.display()));
        }

        match tokio::fs::read_to_string(&path).await {
            Ok(content) => Ok(content),
            Err(e) => Ok(format!("Error reading file: {e}")),
        }
    }
}

pub(crate) fn is_path_allowed(path: &std::path::Path, ctx: &ToolContext) -> bool {
    if let Ok(canonical) = path.canonicalize() {
        for deny in &ctx.deny_paths {
            if let Ok(d) = deny.canonicalize() {
                if canonical.starts_with(&d) {
                    return false;
                }
            }
        }
    }

    if ctx.allow_paths.is_empty() {
        return true;
    }

    if let Ok(canonical) = path.canonicalize() {
        for allow in &ctx.allow_paths {
            if let Ok(a) = allow.canonicalize() {
                if canonical.starts_with(&a) {
                    return true;
                }
            }
        }
        false
    } else {
        false
    }
}
