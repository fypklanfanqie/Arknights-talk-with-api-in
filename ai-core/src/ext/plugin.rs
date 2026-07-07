use serde_json::Value;
use std::sync::Arc;

use crate::message::Message;

pub struct PluginContext {
    pub config: Arc<crate::config::AgentConfig>,
    pub messages: Vec<Message>,
}

pub struct PreMessageCtx {
    pub messages: Vec<Message>,
}

pub struct PreToolCtx {
    pub tool_name: String,
    pub args: Value,
}

use crate::error::AgentResult;
use async_trait::async_trait;

#[async_trait]
pub trait Plugin: Send + Sync {
    fn name(&self) -> &str;
    fn version(&self) -> &str;

    async fn on_init(&self, _ctx: &PluginContext) -> AgentResult<()> { Ok(()) }
    async fn on_user_message(&self, _text: &str, _ctx: &mut PreMessageCtx) -> AgentResult<()> { Ok(()) }
    async fn on_assistant_message(&self, _msg: &Message, _ctx: &PluginContext) -> AgentResult<()> { Ok(()) }
    async fn on_pre_tool(&self, _name: &str, _args: &Value, _ctx: &mut PreToolCtx) -> AgentResult<()> { Ok(()) }
    async fn on_post_tool(&self, _name: &str, _result: &str, _ctx: &PluginContext) -> AgentResult<()> { Ok(()) }
    async fn on_shutdown(&self, _ctx: &PluginContext) -> AgentResult<()> { Ok(()) }
}
