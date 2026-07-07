use crate::error::AgentResult;
use crate::tool::ToolDef;

pub struct McpServer {
    pub name: String,
    tools: Vec<ToolDef>,
}

impl McpServer {
    pub fn new(name: String, tools: Vec<ToolDef>) -> Self {
        Self { name, tools }
    }

    pub async fn serve_stdio(&self) -> AgentResult<()> {
        // MCP server implementation placeholder
        // In v0.1, MCP is scaffolded. Full implementation requires the rmcp crate.
        tracing::info!("MCP server '{}' serve_stdio (placeholder)", self.name);
        Ok(())
    }

    pub fn list_tools(&self) -> Vec<ToolDef> {
        self.tools.clone()
    }
}
