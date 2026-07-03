use ai_core::prelude::*;
use std::io::{self, Write};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = AgentConfig::load().map_err(|e| anyhow::anyhow!("{e}"))?;
    let agent = AgentHandle::spawn(config).await?;
    let mut rx = agent.subscribe();

    // Example: send a message and stream the response
    println!("Sending message...");
    agent.send_message("Hello! Write a simple hello world in Rust.")?;

    while let Ok(event) = rx.recv().await {
        match event {
            KernelOutput::TextDelta { content, .. } => {
                print!("{content}");
                io::stdout().flush().ok();
            }
            KernelOutput::MessageComplete { .. } => {
                println!("\n--- done ---");
                break;
            }
            KernelOutput::Error { message, .. } => {
                eprintln!("Error: {message}");
                break;
            }
            _ => {}
        }
    }

    Ok(())
}
