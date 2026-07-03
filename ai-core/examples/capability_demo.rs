//! Demonstrates the declarative capability system.
//!
//! Run:  cargo run --example capability_demo

use std::sync::Arc;

use serde_json::Value;

use ai_core::define_capability;
use ai_core::kernel::{self, CapabilityId};
use ai_core::tool::{Tool, ToolContext, ToolDef};

// ── Step 1: define a tool (the actual implementation) ──

/// Generates a PPT file from markdown content.
#[derive(Default)]
struct PptGenTool;

#[async_trait::async_trait]
impl Tool for PptGenTool {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "generate_ppt".into(),
            description: "Generate a PowerPoint file from markdown slides".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Presentation title" },
                    "slides": { "type": "string", "description": "Markdown content with --- as slide separator" },
                },
                "required": ["title", "slides"],
            }),
        }
    }

    async fn execute(&self, args: Value, _ctx: &ToolContext) -> ai_core::error::AgentResult<String> {
        let title = args["title"].as_str().unwrap_or("untitled");
        let slide_count = args["slides"].as_str().map(|s| s.split("---").count()).unwrap_or(0);
        Ok(format!("[PPT] \"{title}\" — {slide_count} slides generated"))
    }
}

// ── Step 2: wrap the tool in a capability using the declarative macro ──

define_capability! {
    pub struct PptCap {
        name: "ppt_generator",
        desc: "Generate PowerPoint presentations from markdown slides",
        tools: [PptGenTool],
    }
}

// ── Step 3: install the capability into the global registry ──

fn main() {
    // Register the capability once (in real code, done during crate init)
    kernel::install(Arc::new(PptCap));

    // Verify it's registered
    let reg = kernel::registry().read().unwrap();
    let cap = reg.resolve_by_name("ppt_generator")
        .expect("ppt_generator capability should be registered");

    println!("capability: {}", cap.name());
    println!("description: {}", cap.description());
    for tool in cap.tools() {
        let def = tool.def();
        println!("  tool: {} — {}", def.name, def.description);
    }

    println!("\nhash (transit station key): {}", cap.id().hex());
    println!("same name produces same hash: {}", CapabilityId::of("ppt_generator").hex());
}
