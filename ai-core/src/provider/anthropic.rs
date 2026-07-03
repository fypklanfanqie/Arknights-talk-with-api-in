use async_trait::async_trait;
use futures::StreamExt;
use serde_json::{json, Value};

use super::{LlmOutputStream, LlmProvider, ModelCapabilities};
use crate::error::{AgentError, AgentResult};
use crate::message::{LlmChunk, Message};

pub struct AnthropicProvider {
    id: String,
    model: String,
    api_key: String,
    temperature: f32,
    max_tokens: u32,
    client: reqwest::Client,
}

impl AnthropicProvider {
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
impl LlmProvider for AnthropicProvider {
    fn id(&self) -> &str { &self.id }
    fn model(&self) -> &str { &self.model }
    fn capabilities(&self) -> ModelCapabilities {
        ModelCapabilities {
            max_context_tokens: 200_000,
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
        let (system, msgs) = convert_messages(messages);
        let mut body = json!({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "messages": msgs,
            "stream": true,
        });
        if let Some(sys) = system {
            body["system"] = json!(sys);
        }
        if let Some(t) = tools {
            // Convert OpenAI tool format to Anthropic tool format
            let converted: Vec<Value> = t.iter().map(|tool| {
                let func = &tool["function"];
                json!({
                    "name": func["name"],
                    "description": func["description"],
                    "input_schema": func["parameters"],
                })
            }).collect();
            body["tools"] = json!(converted);
        }

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
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
                Err(e) => return futures::stream::iter(vec![Err(AgentError::Provider(format!("stream error: {e}")))]),
            };
            let text = String::from_utf8_lossy(&bytes);
            futures::stream::iter(parse_anthropic_sse(&text))
        });

        Ok(Box::pin(processed))
    }
}

fn convert_messages(messages: &[Message]) -> (Option<String>, Vec<Value>) {
    let mut system = None;
    let mut converted = Vec::new();

    for msg in messages {
        match msg.role {
            crate::message::Role::System => {
                system = msg.content.clone();
            }
            crate::message::Role::User => {
                converted.push(json!({"role": "user", "content": msg.content}));
            }
            crate::message::Role::Assistant => {
                let content: Vec<Value> = if let Some(ref text) = msg.content {
                    vec![json!({"type": "text", "text": text})]
                } else {
                    msg.tool_calls.iter().map(|tc| {
                        json!({
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.function.name,
                            "input": serde_json::from_str::<Value>(&tc.function.arguments).unwrap_or_default(),
                        })
                    }).collect()
                };
                converted.push(json!({"role": "assistant", "content": content}));
            }
            crate::message::Role::Tool => {
                let content = json!([{
                    "type": "tool_result",
                    "tool_use_id": msg.tool_call_id,
                    "content": msg.content,
                }]);
                converted.push(json!({"role": "user", "content": content}));
            }
        }
    }

    (system, converted)
}

fn parse_anthropic_sse(text: &str) -> Vec<AgentResult<LlmChunk>> {
    let mut results = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(data) = line.strip_prefix("data:").map(|s| s.trim()) {
            if let Ok(value) = serde_json::from_str::<Value>(data) {
                let event_type = value["type"].as_str().unwrap_or("");

                match event_type {
                    "content_block_delta" => {
                        if let Some(delta) = value["delta"].get("text") {
                            if let Some(text) = delta.as_str() {
                                if !text.is_empty() {
                                    results.push(Ok(LlmChunk::TextDelta { content: text.to_string() }));
                                }
                            }
                        }
                        if let Some(input_json) = value["delta"].get("partial_json") {
                            let tc_id = value["index"].as_u64().unwrap_or(0).to_string();
                            results.push(Ok(LlmChunk::ToolCallDelta {
                                id: tc_id,
                                name: None,
                                arguments: input_json.as_str().map(String::from),
                            }));
                        }
                    }
                    "content_block_start" => {
                        if let Some(tool_block) = value["content_block"].get("name") {
                            let tc_id = value["content_block"]["id"].as_str().unwrap_or("").to_string();
                            results.push(Ok(LlmChunk::ToolCallDelta {
                                id: tc_id,
                                name: tool_block.as_str().map(String::from),
                                arguments: Some("".to_string()),
                            }));
                        }
                    }
                    "message_stop" | "message_delta" => {
                        results.push(Ok(LlmChunk::Finished {
                            reason: "end_turn".into(),
                            usage: value.get("usage").map(|u| crate::message::Usage {
                                prompt_tokens: u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                                completion_tokens: u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                                total_tokens: 0,
                            }),
                        }));
                    }
                    _ => {}
                }
            }
        }
    }
    results
}
