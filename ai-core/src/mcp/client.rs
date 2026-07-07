use crate::error::AgentResult;
use crate::tool::ToolDef;

pub struct McpClient {
    pub name: String,
    tools: Vec<ToolDef>,
    connected: bool,
}

impl McpClient {
    pub fn new(name: String) -> Self {
        Self {
            name,
            tools: Vec::new(),
            connected: false,
        }
    }

    pub async fn connect_stdio(&mut self, _command: &[String]) -> AgentResult<()> {
        // MCP client implementation placeholder
        // In v0.1, MCP is scaffolded. Full implementation requires the rmcp crate.
        tracing::info!("MCP client '{}' connect_stdio (placeholder)", self.name);
        self.connected = false;
        Ok(())
    }

    pub async fn discover_tools(&mut self) -> AgentResult<Vec<ToolDef>> {
        Ok(self.tools.clone())
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }
}
