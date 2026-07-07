use async_trait::async_trait;
use futures::StreamExt;
use serde_json::{json, Value};

use super::{LlmOutputStream, LlmProvider, ModelCapabilities};
use crate::error::{AgentError, AgentResult};
use crate::message::{LlmChunk, Message};

pub struct OpenAiProvider {
    id: String,
    model: String,
    api_key: String,
    base_url: String,
    temperature: f32,
    max_tokens: u32,
    client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(
        id: String,
        model: String,
        api_key: String,
        base_url: Option<String>,
        temperature: f32,
        max_tokens: u32,
    ) -> Self {
        Self {
            id,
            model,
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
            temperature,
            max_tokens,
            client: reqwest::Client::new(),
        }
    }

    fn build_body(&self, messages: &[Message], tools: Option<&[Value]>) -> Value {
        let msgs: Vec<Value> = messages.iter().map(|m| message_to_openai(m)).collect();
        let mut body = json!({
            "model": self.model,
            "messages": msgs,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": true,
        });
        if let Some(t) = tools {
            body["tools"] = json!(t);
        }
        body
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    fn id(&self) -> &str { &self.id }
    fn model(&self) -> &str { &self.model }
    fn capabilities(&self) -> ModelCapabilities {
        ModelCapabilities {
            max_context_tokens: 128_000,
            max_output_tokens: 16_384,
            supports_function_calling: true,
            supports_streaming: true,
            programming_languages: vec![
                "rust".into(), "python".into(), "javascript".into(), "typescript".into(),
                "go".into(), "java".into(), "c".into(), "cpp".into(), "csharp".into(),
            ],
        }
    }

    async fn chat(
        &self,
        messages: &[Message],
        tools: Option<&[Value]>,
    ) -> AgentResult<LlmOutputStream> {
        let body = self.build_body(messages, tools);
        let url = format!("{}/chat/completions", self.base_url);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AgentError::Provider(format!("request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AgentError::Provider(format!("HTTP {status}: {text}")));
        }

        let stream = response.bytes_stream();
        let processed = stream.flat_map(move |chunk| {
            let bytes = match chunk {
                Ok(b) => b,
                Err(e) => {
                    return futures::stream::iter(vec![Err(AgentError::Provider(
                        format!("stream error: {e}"),
                    ))]);
                }
            };
            let text = String::from_utf8_lossy(&bytes);
            futures::stream::iter(parse_sse_chunk(&text))
        });

        Ok(Box::pin(processed))
    }
}

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

pub(crate) fn parse_sse_chunk(text: &str) -> Vec<AgentResult<LlmChunk>> {
    let mut results = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        let Some(data) = line.strip_prefix("data:").map(|s| s.trim()) else {
            continue;
        };
        if data == "[DONE]" {
            results.push(Ok(LlmChunk::Finished { reason: "stop".into(), usage: None }));
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        let Some(choices) = value["choices"].as_array() else {
            continue;
        };
        for choice in choices {
            if let Some(delta) = choice.get("delta") {
                if let Some(content) = delta["content"].as_str() {
                    if !content.is_empty() {
                        results.push(Ok(LlmChunk::TextDelta { content: content.to_string() }));
                    }
                }
                if let Some(tool_calls) = delta["tool_calls"].as_array() {
                    for tc in tool_calls {
                        let id = tc["id"].as_str().unwrap_or("").to_string();
                        let name = tc["function"]["name"].as_str().map(String::from);
                        let args = tc["function"]["arguments"].as_str().map(String::from);
                        results.push(Ok(LlmChunk::ToolCallDelta { id, name, arguments: args }));
                    }
                }
            }
            if choice["finish_reason"].as_str().is_some_and(|r| r == "stop" || r == "tool_calls") {
                results.push(Ok(LlmChunk::Finished {
                    reason: choice["finish_reason"].as_str().unwrap_or("stop").to_string(),
                    usage: value.get("usage").map(|u| crate::message::Usage {
                        prompt_tokens: u["prompt_tokens"].as_u64().unwrap_or(0) as u32,
                        completion_tokens: u["completion_tokens"].as_u64().unwrap_or(0) as u32,
                        total_tokens: u["total_tokens"].as_u64().unwrap_or(0) as u32,
                    }),
                }));
            }
        }
    }
    results
}
