use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;

use super::read_file;
use crate::error::AgentResult;
use crate::tool::{Tool, ToolContext, ToolDef};

pub struct GlobTool;

#[async_trait]
impl Tool for GlobTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "glob".into(),
            description: "Find files matching a glob pattern (e.g. '**/*.rs', 'src/**/*.ts')".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Glob pattern to match"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory to search in. Defaults to working directory."
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

        let search_path = match search_path.canonicalize() {
            Ok(p) => p,
            Err(e) => return Ok(format!("Error resolving path: {e}")),
        };

        if !read_file::is_path_allowed(&search_path, ctx) {
            return Ok(format!("Error: path '{}' is not allowed", search_path.display()));
        }

        let full_pattern = format!("{}/{}", search_path.display(), pattern);

        let mut results = String::new();
        let mut count = 0;
        let mut files = Vec::new();
        if let Err(e) = walk_for_glob(&search_path, &search_path, &full_pattern, &mut files, 0) {
            return Ok(format!("Glob error: {e}"));
        }

        for file in &files {
            results.push_str(&format!("{}\n", file.display()));
            count += 1;
            if count >= 200 {
                results.push_str("... (truncated at 200 files)\n");
                break;
            }
        }

        if results.is_empty() {
            Ok("No files found".into())
        } else {
            Ok(results)
        }
    }
}

fn walk_for_glob(
    dir: &Path,
    base: &Path,
    pattern: &str,
    results: &mut Vec<std::path::PathBuf>,
    depth: usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use glob_match::glob_match;

    if depth > 10 || results.len() >= 200 {
        return Ok(());
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let relative = path.strip_prefix(base).unwrap_or(&path);
        let relative_str = relative.to_string_lossy();

        if glob_match(pattern, &relative_str) {
            results.push(relative.to_path_buf());
        }

        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "target" || name == "node_modules" {
                continue;
            }
            let _ = walk_for_glob(&path, base, pattern, results, depth + 1);
        }
    }
    Ok(())
}
