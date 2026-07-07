use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;

use super::read_file;
use crate::error::AgentResult;
use crate::tool::{Tool, ToolContext, ToolDef};

pub struct GrepTool;

#[async_trait]
impl Tool for GrepTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "grep".into(),
            description: "Search for a regex pattern in files. Returns matching lines with file names and line numbers.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regular expression pattern to search for"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory or file path to search in. Defaults to working directory."
                    }
                },
                "required": ["pattern"]
            }),
        }
    }

    async fn execute(&self, args: Value, ctx: &ToolContext) -> AgentResult<String> {
        let pattern = args["pattern"].as_str().unwrap_or("");
        let search_path_str = args["path"].as_str().unwrap_or(".");

        let search_path = if Path::new(search_path_str).is_absolute() {
            Path::new(search_path_str).to_path_buf()
        } else {
            ctx.working_dir.join(search_path_str)
        };

        if !read_file::is_path_allowed(&search_path, ctx) {
            return Ok(format!("Error: path '{}' is not allowed", search_path.display()));
        }

        let re = match regex::Regex::new(pattern) {
            Ok(r) => r,
            Err(e) => return Ok(format!("Invalid regex pattern: {e}")),
        };

        let search_path = match search_path.canonicalize() {
            Ok(p) => p,
            Err(e) => return Ok(format!("Error resolving path: {e}")),
        };

        let mut results = String::new();
        let mut match_count = 0;

        if search_path.is_file() {
            if let Ok(content) = tokio::fs::read_to_string(&search_path).await {
                for (line_num, line) in content.lines().enumerate() {
                    if re.is_match(line) {
                        results.push_str(&format!("{}:{}\n", search_path.display(), line_num + 1));
                        if line.len() < 200 {
                            results.push_str(&format!("  {}\n", line));
                        } else {
                            results.push_str(&format!("  {}...\n", &line[..200]));
                        }
                        match_count += 1;
                        if match_count >= 50 {
                            results.push_str("... (truncated at 50 matches)\n");
                            break;
                        }
                    }
                }
            }
        } else if search_path.is_dir() {
            match walk_and_grep(&search_path, &re, &mut results, &mut match_count).await {
                Ok(_) => {}
                Err(e) => return Ok(format!("Error searching: {e}")),
            }
        }

        if results.is_empty() {
            Ok("No matches found".into())
        } else {
            Ok(results)
        }
    }
}

async fn walk_and_grep(
    dir: &Path,
    re: &regex::Regex,
    results: &mut String,
    match_count: &mut usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut entries = tokio::fs::read_dir(dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "target" || name == "node_modules" {
                continue;
            }
            Box::pin(walk_and_grep(&path, re, results, match_count)).await?;
        } else if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let text_extensions = [
                "rs", "py", "js", "ts", "tsx", "go", "java", "c", "cpp", "h", "hpp",
                "toml", "yaml", "yml", "json", "xml", "html", "css", "scss", "sh", "bash",
                "md", "txt", "rb", "swift", "kt", "scala", "r", "lua", "sql",
            ];
            if !text_extensions.contains(&ext) {
                continue;
            }
            if let Ok(content) = tokio::fs::read_to_string(&path).await {
                for (line_num, line) in content.lines().enumerate() {
                    if re.is_match(line) {
                        results.push_str(&format!("{}:{}\n", path.display(), line_num + 1));
                        if line.len() < 200 {
                            results.push_str(&format!("  {}\n", line));
                        }
                        *match_count += 1;
                        if *match_count >= 50 {
                            results.push_str("... (truncated at 50 matches)\n");
                            return Ok(());
                        }
                    }
                }
            }
        }
        if *match_count >= 50 {
            break;
        }
    }
    Ok(())
}
