use async_trait::async_trait;
use serde_json::{json, Value};

use crate::error::AgentResult;
use crate::tool::{Tool, ToolContext, ToolDef};

pub struct BashTool;

#[async_trait]
impl Tool for BashTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "bash".into(),
            description: "Execute a bash command and return its output. Use with caution.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The bash command to execute"
                    }
                },
                "required": ["command"]
            }),
        }
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> AgentResult<String> {
        let command = args["command"].as_str().unwrap_or("");

        if command.trim().is_empty() {
            return Ok("Error: empty command".into());
        }

        let child = match tokio::process::Command::new("bash")
            .arg("-c")
            .arg(command)
            .current_dir(&ctx.working_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => return Ok(format!("Error spawning command: {e}")),
        };

        match tokio::time::timeout(std::time::Duration::from_secs(120), child.wait_with_output()).await {
            Ok(Ok(output)) => {
                let mut result = String::new();
                if !output.stdout.is_empty() {
                    result.push_str(&String::from_utf8_lossy(&output.stdout));
                }
                if !output.stderr.is_empty() {
                    if !result.is_empty() {
                        result.push('\n');
                    }
                    result.push_str("STDERR:\n");
                    result.push_str(&String::from_utf8_lossy(&output.stderr));
                }
                if result.is_empty() {
                    result = format!("Command completed with exit code {}", output.status.code().unwrap_or(-1));
                }
                Ok(result)
            }
            Ok(Err(e)) => Ok(format!("Error running command: {e}")),
            Err(_) => Ok("Error: command timed out after 120 seconds".into()),
        }
    }
}
