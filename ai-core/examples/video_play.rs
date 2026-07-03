//! Demonstrates the declarative capability system: an agent that plays WebM video
//! clips based on conversational intent, using the same pattern as voice_speak.
//!
//! ## How it works
//! 1. Developer defines `WebmPlayer` (tool impl) + wraps with `define_capability!`
//! 2. Calls `kernel::install()` once at startup
//! 3. End user enables in `.clusai.toml` with `video_capability = true`
//! 4. Drops WebM files into `./videos/` named by intent
//! 5. Kernel auto-injects the tool. LLM calls `play_video(intent="greeting")` — plays the clip.
//!
//! ## Run
//! ```sh
//! mkdir ./videos
//! cp some-clip.webm ./videos/greeting.webm
//! cargo run --example video_play
//! ```

use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;

use serde_json::Value;

use ai_core::define_capability;
use ai_core::kernel;
use ai_core::tool::{Tool, ToolContext, ToolDef};

/// Plays a pre-recorded WebM video clip matching a conversational intent.
/// Files must be placed under `./videos/`, named `<intent>.webm`.
#[derive(Default)]
struct WebmPlayer {
    videos_dir: PathBuf,
}

impl WebmPlayer {
    fn find_player() -> Option<&'static str> {
        for bin in &["mpv", "ffplay", "vlc", "mplayer"] {
            if Command::new("which")
                .arg(bin)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                return Some(bin);
            }
        }
        None
    }

    fn play_file(file: &str) -> Result<(), String> {
        let player =
            Self::find_player().ok_or("no video player found (tried mpv, ffplay, vlc, mplayer)")?;
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
impl Tool for WebmPlayer {
    fn def(&self) -> ToolDef {
        ToolDef {
            name: "play_video".into(),
            description: "Play a pre-recorded WebM video clip matching the given conversational intent. \
                          Available intents: greeting, goodbye, thinking, confirm, error, agree, explain, warn. \
                          Use this when visual feedback would enhance the response (e.g. a welcome animation for greeting, \
                          a spinner for thinking, a celebration animation for confirm)."
                .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string",
                        "enum": ["greeting", "goodbye", "thinking", "confirm", "error", "agree", "explain", "warn"],
                        "description": "Conversational intent to match a WebM clip"
                    }
                },
                "required": ["intent"]
            }),
        }
    }

    async fn execute(
        &self,
        args: Value,
        _ctx: &ToolContext,
    ) -> ai_core::error::AgentResult<String> {
        let intent = args["intent"].as_str().unwrap_or("confirm");
        let file = self.videos_dir.join(format!("{intent}.webm"));

        if !file.exists() {
            return Ok(format!(
                "[video] intent=\"{intent}\" — file not found at {} (place {intent}.webm in ./videos/)",
                file.display()
            ));
        }

        match WebmPlayer::play_file(file.to_str().unwrap_or("")) {
            Ok(()) => Ok(format!("[video] played {intent}.webm")),
            Err(e) => Ok(format!("[video] intent=\"{intent}\" — playback error: {e}")),
        }
    }
}

// ─── Declare the capability ──────────────────────────────────────────────

define_capability! {
    pub struct VideoCap {
        name: "video_capability",
        desc: "Play pre-recorded WebM video clips matching conversational intent (greeting, goodbye, thinking, confirm, error, agree, explain, warn)",
        tools: [WebmPlayer],
    }
}

// ─── Install + demonstrate ───────────────────────────────────────────────

fn main() {
    kernel::install(Arc::new(VideoCap));

    let reg = kernel::registry().read().unwrap();
    let cap = reg
        .resolve_by_name("video_capability")
        .expect("video_capability should be registered");

    println!("=== Capability registered ===");
    println!("  name:        {}", cap.name());
    println!("  description: {}", cap.description());
    for tool in cap.tools() {
        let def = tool.def();
        println!("  tool: {} — {}", def.name, def.description);
    }

    println!("\n=== Tool test ===");
    let player = WebmPlayer {
        videos_dir: PathBuf::from("./videos"),
    };
    let rt = tokio::runtime::Runtime::new().unwrap();

    for intent in &["greeting", "thinking", "confirm", "goodbye"] {
        let args = serde_json::json!({ "intent": intent });
        let result = rt.block_on(player.execute(
            args,
            &ToolContext {
                working_dir: std::env::current_dir().unwrap(),
                allow_paths: vec![],
                deny_paths: vec![],
            },
        ));
        match result {
            Ok(msg) => println!("  {msg}"),
            Err(e) => println!("  error: {e}"),
        }
    }

    println!("\n=== User config (add to .clusai.toml) ===");
    println!("  [tools]");
    println!("  video_capability = true");
    println!();
    println!("  Place WebM files in ./videos/: greeting.webm, goodbye.webm, ...");
}
