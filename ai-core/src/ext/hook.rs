use crate::error::AgentResult;
use crate::message::Message;
use async_trait::async_trait;
use serde_json::Value;

pub enum HookResult<T> {
    Pass,
    Replace(T),
    Reject(String),
}

#[async_trait]
pub trait Hook: Send + Sync {
    async fn augment_messages(&self, msgs: Vec<Message>) -> AgentResult<Vec<Message>> {
        Ok(msgs)
    }

    async fn intercept_tool(&self, _name: &str, _args: &Value) -> AgentResult<HookResult<Value>> {
        Ok(HookResult::Pass)
    }
}
