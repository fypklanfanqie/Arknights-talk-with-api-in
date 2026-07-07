use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;

use super::read_file;
use crate::error::AgentResult;
use crate::tool::{Tool, ToolContext, ToolDef};

pub struct WriteFileTool;

#[async_trait]
impl Tool for WriteFileTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "write_file".into(),
            description: "Write content to a file at the given path. Creates parent directories if needed.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        }
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> AgentResult<String> {
        let path_str = args["path"].as_str().unwrap_or("");
        let content = args["content"].as_str().unwrap_or("");

        let path = if Path::new(path_str).is_absolute() {
            Path::new(path_str).to_path_buf()
        } else {
            ctx.working_dir.join(path_str)
        };

        if !read_file::is_path_allowed(&path, ctx) {
            return Ok(format!("Error: path '{}' is not allowed", path.display()));
        }

        if let Some(parent) = path.parent() {
            if !parent.exists() {
                if let Err(e) = tokio::fs::create_dir_all(parent).await {
                    return Ok(format!("Error creating directory: {e}"));
                }
            }
        }

        match tokio::fs::write(&path, content).await {
            Ok(_) => Ok(format!("Successfully wrote {} bytes to {}", content.len(), path.display())),
            Err(e) => Ok(format!("Error writing file: {e}")),
        }
    }
}
