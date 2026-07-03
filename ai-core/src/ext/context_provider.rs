use crate::error::AgentResult;
use async_trait::async_trait;

#[async_trait]
pub trait ContextProvider: Send + Sync {
    fn name(&self) -> &str;

    async fn get_context(&self) -> AgentResult<Option<String>>;
}
