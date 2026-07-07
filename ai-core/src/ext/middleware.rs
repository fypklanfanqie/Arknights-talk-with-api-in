use crate::error::AgentResult;
use async_trait::async_trait;

#[async_trait]
pub trait Middleware: Send + Sync {
    fn name(&self) -> &str;

    async fn pre_process(&self, msg: &str) -> AgentResult<String> {
        Ok(msg.to_owned())
    }

    async fn post_process(&self, msg: &str) -> AgentResult<String> {
        Ok(msg.to_owned())
    }
}

pub struct MiddlewareChain {
    middlewares: Vec<Box<dyn Middleware>>,
}

impl MiddlewareChain {
    pub fn new() -> Self {
        Self { middlewares: vec![] }
    }

    pub fn push(&mut self, mw: Box<dyn Middleware>) {
        self.middlewares.push(mw);
    }

    pub async fn pre_process(&self, input: &str) -> AgentResult<String> {
        let mut current = input.to_owned();
        for mw in &self.middlewares {
            current = mw.pre_process(&current).await?;
        }
        Ok(current)
    }

    pub async fn post_process(&self, output: &str) -> AgentResult<String> {
        let mut current = output.to_owned();
        for mw in &self.middlewares {
            current = mw.post_process(&current).await?;
        }
        Ok(current)
    }

    pub fn len(&self) -> usize {
        self.middlewares.len()
    }

    pub fn is_empty(&self) -> bool {
        self.middlewares.is_empty()
    }
}

impl Default for MiddlewareChain {
    fn default() -> Self {
        Self::new()
    }
}
