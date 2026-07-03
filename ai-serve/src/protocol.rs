use ai_core::interface::output::KernelOutput;
use ai_core::serve::protocol::{Event, SessionMeta};

pub fn kernel_to_event(out: KernelOutput) -> Option<Event> {
    Some(match out {
        KernelOutput::TextDelta { content, model, .. } => {
            Event::TextDelta { agent_id: model, content }
        }
        KernelOutput::ToolCallStart { tool_name, args_preview, .. } => {
            Event::ToolCallStart { agent_id: String::new(), tool_name, args_preview }
        }
        KernelOutput::ToolCallEnd { tool_name, succeeded, output_preview, .. } => {
            Event::ToolCallEnd { agent_id: String::new(), tool_name, succeeded, output_preview }
        }
        KernelOutput::MessageComplete { message } => {
            Event::AgentFinished { agent_id: String::new(), content: message.content.unwrap_or_default() }
        }
        KernelOutput::Error { message, .. } => Event::Error { message },
        KernelOutput::RoundtableComplete => Event::ThinkComplete,
        KernelOutput::SessionSaved { id } => Event::SessionSaved { id },
        KernelOutput::SessionLoaded { id, message_count } => Event::SessionLoaded { id, message_count },
        KernelOutput::SessionList { sessions } => Event::SessionList {
            sessions: sessions.into_iter().map(SessionMeta::from).collect(),
        },
        _ => return None,
    })
}

pub fn event_to_json(event: &Event) -> String {
    let mut s = serde_json::to_string(event).unwrap_or_default();
    s.push('\n');
    s
}
