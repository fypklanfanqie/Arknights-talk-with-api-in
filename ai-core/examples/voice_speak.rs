//! Demonstrates the declarative capability system with a real use case:
//! an agent that can play pre-recorded MP3 voice clips based on conversational intent.
//!
//! ## How it works
//! 1. Developer defines `Mp3Speaker` (tool impl) + wraps with `define_capability!`
//! 2. Calls `kernel::install()` once at startup
//! 3. End user enables it in `.clusai.toml` with `speak_capability = true`
//! 4. Drops MP3 files named by intent into `./voices/` (greeting.mp3, goodbye.mp3, ...)
//! 5. The kernel auto-injects the tool. LLM calls `speak(intent="greeting")` — tool plays the file.
//!
//! ## Run
//! ```sh
//! mkdir ./voices
//! cp some-file.mp3 ./voices/greeting.mp3   # place a real mp3
//! cargo run --example voice_speak
//! ```

use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;

use serde_json::Value;

use ai_core::define_capability;
use ai_core::kernel;
use ai_core::tool::{Tool, ToolContext, ToolDef};

// ─── Step 1: the tool implementation ────────────────────────────────────

/// Plays a pre-recorded MP3 voice clip for a given conversational intent.
/// MP3 files must be placed under `./voices/`, named `<intent>.mp3`.
#[derive(Default)]
struct Mp3Speaker {
    voices_dir: PathBuf,
}

impl Mp3Speaker {
    fn find_player() -> Option<&'static str> {
        for bin in &["mpv", "ffplay", "paplay", "aplay"] {
            if Command::new("which").arg(bin).output().map(|o| o.status.success()).unwrap_or(false) {
                return Some(bin);
            }
        }
        None
    }

    fn play_file(file: &str) -> Result<(), String> {
        let player = Self::find_player().ok_or("no audio player found (tried mpv, ffplay, paplay, aplay)")?;
        let status = Command::new(player)
            .arg(file)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("failed to spawn {player}: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("{player} exited with {status}"))
        }
    }
}

#[async_trait::async_trait]
impl Tool for Mp3Speaker {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "speak".into(),
            description: "Play a pre-recorded MP3 voice clip matching the given conversational intent. \
                          Available intents: greeting, goodbye, thinking, confirm, error, agree, explain, warn. \
                          Use this tool to add audio feedback based on the current conversational mood.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string",
                        "enum": ["greeting", "goodbye", "thinking", "confirm", "error", "agree", "explain", "warn"],
                        "description": "Conversational intent to voice-match"
                    }
                },
                "required": ["intent"]
            }),
        }
    }

    async fn execute(&self, args: Value, _ctx: &ToolContext) -> ai_core::error::AgentResult<String> {
        let intent = args["intent"].as_str().unwrap_or("confirm");
        let file = self.voices_dir.join(format!("{intent}.mp3"));

        if !file.exists() {
            return Ok(format!(
                "[speak] intent=\"{intent}\" — file not found at {} (place {intent}.mp3 in ./voices/)",
                file.display()
            ));
        }

        match Mp3Speaker::play_file(file.to_str().unwrap_or("")) {
            Ok(()) => Ok(format!("[speak] played {intent}.mp3")),
            Err(e) => Ok(format!("[speak] intent=\"{intent}\" — playback error: {e}")),
        }
    }
}

// ─── Step 2: declare the capability ─────────────────────────────────────

define_capability! {
    pub struct SpeakCap {
        name: "speak_capability",
        desc: "Play pre-recorded MP3 voice clips matching conversational intent (greeting, goodbye, thinking, confirm, error, agree, explain, warn)",
        tools: [Mp3Speaker],
    }
}

// ─── Step 3: install + demonstrate ──────────────────────────────────────

fn main() {
    // ── register the capability (real apps do this at startup) ──
    kernel::install(Arc::new(SpeakCap));

    // ── verify it's registered ──
    let reg = kernel::registry().read().unwrap();
    let cap = reg.resolve_by_name("speak_capability")
        .expect("speak_capability should be registered");

    println!("=== Capability registered ===");
    println!("  name:        {}", cap.name());
    println!("  description: {}", cap.description());
    println!("  tools:");
    for tool in cap.tools() {
        let def = tool.def();
        println!("    {} — {}", def.name, def.description);
    }

    // ── demonstrate the tool directly ──
    println!("\n=== Tool test ===");
    let speaker = Mp3Speaker { voices_dir: PathBuf::from("./voices") };
    let rt = tokio::runtime::Runtime::new().unwrap();

    for intent in &["greeting", "thinking", "confirm", "goodbye"] {
        let args = serde_json::json!({ "intent": intent });
        let result = rt.block_on(speaker.execute(args, &ToolContext {
            working_dir: std::env::current_dir().unwrap(),
            allow_paths: vec![],
            deny_paths: vec![],
        }));
        match result {
            Ok(msg) => println!("  {msg}"),
            Err(e) => println!("  error: {e}"),
        }
    }

    println!("\n=== User config (add to .clusai.toml) ===");
    println!("  [tools]");
    println!("  speak_capability = true");
    println!();
    println!("  Place MP3 files in ./voices/: greeting.mp3, goodbye.mp3, ...");
}
