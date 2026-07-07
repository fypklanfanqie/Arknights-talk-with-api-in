use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;

use crate::config::ProviderConfig;
use crate::error::{AgentError, AgentResult};
use crate::message::{LlmChunk, Message};

pub mod openai;
pub mod anthropic;
pub mod ollama;
pub mod deepseek;

/// Model capabilities for blueprint role assignment
#[derive(Debug, Clone)]
pub struct ModelCapabilities {
    pub max_context_tokens: usize,
    pub max_output_tokens: usize,
    pub supports_function_calling: bool,
    pub supports_streaming: bool,
    pub programming_languages: Vec<String>,
}

/// Output stream from LLM provider
pub type LlmOutputStream = Pin<Box<dyn Stream<Item = AgentResult<LlmChunk>> + Send>>;

/// Unified provider trait — every LLM backend implements this
#[async_trait]
pub trait LlmProvider: Send + Sync {
    fn id(&self) -> &str;
    fn model(&self) -> &str;
    fn capabilities(&self) -> ModelCapabilities;

    async fn chat(
        &self,
        messages: &[Message],
        tools: Option<&[serde_json::Value]>,
    ) -> AgentResult<LlmOutputStream>;
}

/// Resolve API key: config value first, then env var, then error
fn resolve_api_key(cfg: &ProviderConfig, default_env: &str) -> AgentResult<String> {
    if let Some(ref key) = cfg.api_key {
        return Ok(key.clone());
    }
    if let Some(ref env_name) = cfg.api_key_env {
        return std::env::var(env_name).map_err(|_| {
            AgentError::Config(format!(
                "env var '{env_name}' not set for provider '{}'",
                cfg.id
            ))
        });
    }
    std::env::var(default_env).map_err(|_| {
        AgentError::Config(format!(
            "no api_key configured for provider '{}': set api_key, api_key_env, or env var '{default_env}'",
            cfg.id
        ))
    })
}

/// Factory function: create a provider from config
pub fn create_provider(cfg: &ProviderConfig) -> AgentResult<Box<dyn LlmProvider>> {
    match cfg.provider_type {
        crate::config::ProviderType::OpenAI => {
            let api_key = resolve_api_key(cfg, "OPENAI_API_KEY")?;
            Ok(Box::new(openai::OpenAiProvider::new(
                cfg.id.clone(),
                cfg.model.clone(),
                api_key,
                cfg.base_url.clone(),
                cfg.temperature,
                cfg.max_tokens,
            )))
        }
        crate::config::ProviderType::Anthropic => {
            let api_key = resolve_api_key(cfg, "ANTHROPIC_API_KEY")?;
            Ok(Box::new(anthropic::AnthropicProvider::new(
                cfg.id.clone(),
                cfg.model.clone(),
                api_key,
                cfg.temperature,
                cfg.max_tokens,
            )))
        }
        crate::config::ProviderType::Ollama => {
            Ok(Box::new(ollama::OllamaProvider::new(
                cfg.id.clone(),
                cfg.model.clone(),
                cfg.base_url
                    .clone()
                    .unwrap_or_else(|| "http://localhost:11434".to_string()),
                cfg.temperature,
                cfg.max_tokens,
            )))
        }
        crate::config::ProviderType::DeepSeek => {
            let api_key = resolve_api_key(cfg, "DEEPSEEK_API_KEY")?;
            Ok(Box::new(deepseek::DeepSeekProvider::new(
                cfg.id.clone(),
                cfg.model.clone(),
                api_key,
                cfg.temperature,
                cfg.max_tokens,
            )))
        }
        crate::config::ProviderType::OpenAICompatible => {
            let base_url = cfg.base_url.clone().unwrap_or_default();
            let api_key = resolve_api_key(cfg, "OPENAI_API_KEY").unwrap_or_default();
            Ok(Box::new(openai::OpenAiProvider::new(
                cfg.id.clone(),
                cfg.model.clone(),
                api_key,
                Some(base_url),
                cfg.temperature,
                cfg.max_tokens,
            )))
        }
    }
}
