use async_trait::async_trait;
use futures::StreamExt;
use serde_json::{json, Value};

use super::{LlmOutputStream, LlmProvider, ModelCapabilities};
use crate::error::{AgentError, AgentResult};
use crate::message::Message;

pub struct DeepSeekProvider {
    id: String,
    model: String,
    api_key: String,
    temperature: f32,
    max_tokens: u32,
    client: reqwest::Client,
}

impl DeepSeekProvider {
    pub fn new(id: String, model: String, api_key: String, temperature: f32, max_tokens: u32) -> Self {
        Self {
            id,
            model,
            api_key,
            temperature,
            max_tokens,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for DeepSeekProvider {
    fn id(&self) -> &str { &self.id }
    fn model(&self) -> &str { &self.model }
    fn capabilities(&self) -> ModelCapabilities {
        ModelCapabilities {
            max_context_tokens: 128_000,
            max_output_tokens: 32_000,
            supports_function_calling: true,
            supports_streaming: true,
            programming_languages: vec![
                "rust".into(), "python".into(), "javascript".into(), "typescript".into(),
                "go".into(), "java".into(), "c".into(), "cpp".into(),
            ],
        }
    }

    async fn chat(
        &self,
        messages: &[Message],
        tools: Option<&[Value]>,
    ) -> AgentResult<LlmOutputStream> {
        let msgs: Vec<Value> = messages.iter().map(|m| message_to_openai(m)).collect();

        let mut body = json!({
            "model": self.model,
            "messages": msgs,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": true,
        });

        // Forward tools to API
        if let Some(t) = tools {
            body["tools"] = json!(t);
        }

        let response = self
            .client
            .post("https://api.deepseek.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AgentError::Provider(format!("deepseek request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AgentError::Provider(format!("DeepSeek HTTP {status}: {text}")));
        }

        let stream = response.bytes_stream();
        let processed = stream.flat_map(move |chunk| {
            let bytes = match chunk {
                Ok(b) => b,
                Err(e) => return futures::stream::iter(vec![Err(AgentError::Provider(format!("stream error: {e}")))]),
            };
            let text = String::from_utf8_lossy(&bytes);
            futures::stream::iter(super::openai::parse_sse_chunk(&text))
        });

        Ok(Box::pin(processed))
    }
}

/// Maps internal Message to OpenAI-compatible JSON (with tool_call support)
fn message_to_openai(msg: &Message) -> Value {
    let mut v = json!({
        "role": match msg.role {
            crate::message::Role::System => "system",
            crate::message::Role::User => "user",
            crate::message::Role::Assistant => "assistant",
            crate::message::Role::Tool => "tool",
        },
    });

    if let Some(ref content) = msg.content {
        v["content"] = json!(content);
    }
    if !msg.tool_calls.is_empty() {
        v["tool_calls"] = json!(msg.tool_calls);
    }
    if let Some(ref id) = msg.tool_call_id {
        v["tool_call_id"] = json!(id);
    }
    if let Some(ref name) = msg.name {
        v["name"] = json!(name);
    }

    v
}
