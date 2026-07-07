use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use serde_json::Value;

use crate::error::AgentResult;

pub mod builtin;
pub mod types;

pub use types::{ToolContext, ToolDef, ToolResult};

#[async_trait]
pub trait Tool: Send + Sync {
    fn def(&self) -> ToolDef;
    async fn execute(&self, args: Value, ctx: &ToolContext) -> AgentResult<String>;
}

pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
    schema_cache: Mutex<Option<Vec<Value>>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self { tools: HashMap::new(), schema_cache: Mutex::new(None) }
    }

    pub fn register(&mut self, tool: impl Tool + 'static) {
        let arc: Arc<dyn Tool> = Arc::new(tool);
        let name = arc.def().name.clone();
        self.tools.insert(name, arc);
        self.schema_cache.lock().unwrap().take();
    }

    pub fn register_arc(&mut self, tool: Arc<dyn Tool>) {
        let name = tool.def().name.clone();
        self.tools.insert(name, tool);
        self.schema_cache.lock().unwrap().take();
    }

    pub fn get(&self, name: &str) -> Option<&Arc<dyn Tool>> {
        self.tools.get(name)
    }

    pub fn list_names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    pub fn list_definitions(&self) -> Vec<ToolDef> {
        self.tools.values().map(|t| t.def()).collect()
    }

    pub fn openai_tool_schemas(&self) -> Vec<Value> {
        {
            let cache = self.schema_cache.lock().unwrap();
            if let Some(cached) = cache.as_ref() {
                return cached.clone();
            }
        }
        let schemas: Vec<Value> = self
            .tools
            .values()
            .map(|t| {
                let def = t.def();
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": def.name,
                        "description": def.description,
                        "parameters": def.parameters,
                    }
                })
            })
            .collect();
        self.schema_cache.lock().unwrap().replace(schemas.clone());
        schemas
    }

    pub async fn execute(
        &self,
        name: &str,
        args: Value,
        ctx: &ToolContext,
    ) -> AgentResult<String> {
        match self.get(name) {
            Some(tool) => tool.execute(args, ctx).await,
            None => Err(crate::error::AgentError::Tool {
                name: name.to_owned(),
                message: "tool not found".into(),
            }),
        }
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}
