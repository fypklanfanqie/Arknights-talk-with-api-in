use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;

use crate::kernel::{self, Capability, CapabilityId};
use crate::tool::{Tool, ToolContext, ToolDef};

pub fn install() {
    kernel::registry().write().unwrap().register(Arc::new(PauseCap));
}

struct PauseCap;

impl Capability for PauseCap {
    fn id(&self) -> CapabilityId { CapabilityId::of("conversation_pace") }
    fn name(&self) -> &str { "conversation_pace" }
    fn description(&self) -> &str { "Control per-provider speaking speed and inter-utterance pauses" }
    fn tools(&self) -> Vec<Arc<dyn Tool>> { vec![Arc::new(PauseTool)] }
}

struct PauseTool;

#[async_trait::async_trait]
impl Tool for PauseTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "pause".into(),
            description: "Pause before your next action. Use this to create natural conversational rhythm.\n\
                          1-2s for brief pauses, 3-4s for dramatic effect, 5s max.\n\
                          The actual pause duration is adjusted by your provider's 'speed' config (0.0-1.0, 1.0=full speed).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "seconds": { "type": "integer", "minimum": 1, "maximum": 5 }
                },
                "required": ["seconds"]
            }),
        }
    }

    async fn execute(&self, args: Value, _ctx: &ToolContext) -> crate::error::AgentResult<String> {
        let secs = args["seconds"].as_u64().unwrap_or(2) as f64;
        let speed = kernel::current_speed();
        let ms = (secs / speed * 1000.0) as u64;
        tokio::time::sleep(Duration::from_millis(ms)).await;
        Ok(format!("paused {secs}s (speed {speed:.2})"))
    }
}
