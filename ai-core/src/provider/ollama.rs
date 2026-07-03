use async_trait::async_trait;
use futures::StreamExt;
use serde_json::{json, Value};

use super::{LlmOutputStream, LlmProvider, ModelCapabilities};
use crate::error::{AgentError, AgentResult};
use crate::message::{LlmChunk, Message};

pub struct OllamaProvider {
    id: String,
    model: String,
    base_url: String,
    temperature: f32,
    num_predict: u32,
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(id: String, model: String, base_url: String, temperature: f32, num_predict: u32) -> Self {
        Self {
            id,
            model,
            base_url,
            temperature,
            num_predict,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn id(&self) -> &str { &self.id }
    fn model(&self) -> &str { &self.model }
    fn capabilities(&self) -> ModelCapabilities {
        ModelCapabilities {
            max_context_tokens: 8192,
            max_output_tokens: 4096,
            supports_function_calling: false,
            supports_streaming: true,
            programming_languages: vec![],
        }
    }

    async fn chat(
        &self,
        messages: &[Message],
        _tools: Option<&[Value]>,
    ) -> AgentResult<LlmOutputStream> {
        let msgs: Vec<Value> = messages.iter().map(|m| {
            json!({
                "role": match m.role {
                    crate::message::Role::System | crate::message::Role::Assistant => "assistant",
                    crate::message::Role::User => "user",
                    crate::message::Role::Tool => "user",
                },
                "content": m.content.as_deref().unwrap_or(""),
            })
        }).collect();

        let body = json!({
            "model": self.model,
            "messages": msgs,
            "stream": true,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.num_predict,
            },
        });

        let response = self
            .client
            .post(&format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| AgentError::Provider(format!("ollama request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AgentError::Provider(format!("Ollama HTTP {status}: {text}")));
        }

        let stream = response.bytes_stream();
        let processed = stream.flat_map(move |chunk| {
            let bytes = match chunk {
                Ok(b) => b,
                Err(e) => return futures::stream::iter(vec![Err(AgentError::Provider(format!("stream error: {e}")))]),
            };
            let text = String::from_utf8_lossy(&bytes);
            futures::stream::iter(parse_ollama_chunk(&text))
        });

        Ok(Box::pin(processed))
    }
}

fn parse_ollama_chunk(text: &str) -> Vec<AgentResult<LlmChunk>> {
    let mut results = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            if let Some(content) = value["message"]["content"].as_str() {
                if !content.is_empty() {
                    results.push(Ok(LlmChunk::TextDelta { content: content.to_string() }));
                }
            }
            if value["done"].as_bool().unwrap_or(false) {
                results.push(Ok(LlmChunk::Finished {
                    reason: "stop".into(),
                    usage: None,
                }));
            }
        }
    }
    results
}
