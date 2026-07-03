use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::broadcast;

use crate::error::AgentResult;
use crate::tool::{Tool, ToolContext, ToolDef};
use crate::space::event::SpaceEvent;
use crate::space::world::WorldRegistry;

pub struct SpeakTool {
    agent_id: String,
    event_tx: broadcast::Sender<SpaceEvent>,
}

impl SpeakTool {
    pub fn new(agent_id: String, event_tx: broadcast::Sender<SpaceEvent>) -> Self {
        Self { agent_id, event_tx }
    }
}

#[async_trait]
impl Tool for SpeakTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "speak".into(),
            description: "向其他角色发出话语".into(),
            parameters: json!({
                "type": "object",
                "properties": { "text": { "type": "string", "description": "你要说的话" } },
                "required": ["text"]
            }),
        }
    }

    async fn execute(&self, args: Value, _ctx: &ToolContext) -> AgentResult<String> {
        let text = args["text"].as_str().unwrap_or("");
        let _ = self.event_tx.send(SpaceEvent::AgentSpeech {
            agent_id: self.agent_id.clone(), text: text.to_string(),
        });
        Ok(format!("你说：{}", text))
    }
}

pub struct ReadWorldTool {
    worlds: WorldRegistry,
}

impl ReadWorldTool {
    pub fn new(worlds: WorldRegistry) -> Self { Self { worlds } }
}

#[async_trait]
impl Tool for ReadWorldTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "read_world".into(),
            description: "读取世界状态中的值。参数 world=世界名, key=键名".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "world": { "type": "string", "description": "世界名称" },
                    "key": { "type": "string", "description": "要读取的键名" }
                },
                "required": ["world", "key"]
            }),
        }
    }

    async fn execute(&self, args: Value, _ctx: &ToolContext) -> AgentResult<String> {
        let world = args["world"].as_str().unwrap_or("default");
        let key = args["key"].as_str().unwrap_or("");
        match self.worlds.get(world, key).await {
            Some(val) => Ok(serde_json::to_string_pretty(&val)?),
            None => Ok(format!("世界 '{}' 中没有键 '{}'", world, key)),
        }
    }
}

pub struct WriteWorldTool {
    worlds: WorldRegistry,
    event_tx: broadcast::Sender<SpaceEvent>,
}

impl WriteWorldTool {
    pub fn new(worlds: WorldRegistry, event_tx: broadcast::Sender<SpaceEvent>) -> Self {
        Self { worlds, event_tx }
    }
}

#[async_trait]
impl Tool for WriteWorldTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "write_world".into(),
            description: "写入世界状态。参数 world=世界名, key=键名, value=任意JSON值".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "world": { "type": "string", "description": "世界名称" },
                    "key": { "type": "string", "description": "键名" },
                    "value": { "description": "任意 JSON 值" }
                },
                "required": ["world", "key", "value"]
            }),
        }
    }

    async fn execute(&self, args: Value, _ctx: &ToolContext) -> AgentResult<String> {
        let world = args["world"].as_str().unwrap_or("default");
        let key = args["key"].as_str().unwrap_or("");
        let value = args["value"].clone();

        self.worlds.set(world, key, value.clone()).await;
        let _ = self.event_tx.send(SpaceEvent::StateChanged {
            world: world.to_string(), key: key.to_string(), value: value.clone(),
        });
        Ok(format!("已写入 {}：{}", key, serde_json::to_string(&value).unwrap_or_default()))
    }
}
