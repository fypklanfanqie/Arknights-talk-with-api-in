pub mod client;
pub mod server;

pub use client::McpClient;
pub use server::McpServer;

pub struct McpConfig {
    pub name: String,
    pub command: Vec<String>,
    pub args: Vec<String>,
    pub enabled: bool,
}
