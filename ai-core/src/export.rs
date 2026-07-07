use crate::message::{Message, Role};
use serde::Serialize;
use std::borrow::Cow;

#[derive(Debug, Clone, Copy)]
pub enum ExportFormat {
    Txt,
    Json,
    Markdown,
}

impl ExportFormat {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "txt" | "text" => Some(Self::Txt),
            "json" => Some(Self::Json),
            "md" | "markdown" => Some(Self::Markdown),
            _ => None,
        }
    }

    pub fn extension(&self) -> &str {
        match self {
            Self::Txt => "txt",
            Self::Json => "json",
            Self::Markdown => "md",
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            Self::Txt => "txt",
            Self::Json => "json",
            Self::Markdown => "markdown",
        }
    }
}

impl Default for ExportFormat {
    fn default() -> Self { Self::Txt }
}

pub fn format_history(history: &[Message], format: ExportFormat, models: &[String]) -> String {
    match format {
        ExportFormat::Txt => format_txt(history, models),
        ExportFormat::Json => format_json(history, models),
        ExportFormat::Markdown => format_markdown(history, models),
    }
}

fn role_label(role: &Role, name: Option<&str>) -> Cow<'static, str> {
    match name {
        Some(n) if !n.is_empty() => Cow::Owned(format!("{}", n)),
        _ => match role {
            Role::System => Cow::Borrowed("系统"),
            Role::User => Cow::Borrowed("用户"),
            Role::Assistant => Cow::Borrowed("AI"),
            Role::Tool => Cow::Borrowed("工具"),
        },
    }
}

fn format_txt(history: &[Message], models: &[String]) -> String {
    let mut out = String::new();
    out.push_str("============================================================\n");
    out.push_str(&format!("对话记录\n"));
    out.push_str(&format!("参与模型: {}\n", models.join(", ")));
    out.push_str("============================================================\n\n");

    for msg in history {
        let content = msg.content.as_deref().unwrap_or("");
        if content.is_empty() { continue; }
        let lbl = role_label(&msg.role, msg.name.as_deref());
        out.push_str(&format!("[{}] {}\n", lbl, content));
    }
    out
}

fn format_json(history: &[Message], models: &[String]) -> String {
    #[derive(Serialize)]
    struct Export<'a> {
        models: &'a [String],
        messages: Vec<ExportMsg>,
    }
    #[derive(Serialize)]
    struct ExportMsg {
        role: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
    }

    let msgs: Vec<_> = history
        .iter()
        .filter_map(|m| {
            let content = m.content.as_deref().unwrap_or("");
            if content.is_empty() { return None; }
            Some(ExportMsg {
                role: match m.role {
                    Role::System => "system".into(),
                    Role::User => "user".into(),
                    Role::Assistant => "assistant".into(),
                    Role::Tool => "tool".into(),
                },
                content: content.into(),
                name: m.name.clone(),
            })
        })
        .collect();

    let export = Export { models, messages: msgs };
    serde_json::to_string_pretty(&export).unwrap_or_default()
}

fn format_markdown(history: &[Message], models: &[String]) -> String {
    let mut out = String::new();
    out.push_str("# 对话记录\n\n");
    out.push_str(&format!("**参与模型**: {}\n\n", models.join(", ")));
    out.push_str("---\n\n");

    let mut last_name = String::new();
    for msg in history {
        let content = msg.content.as_deref().unwrap_or("");
        if content.is_empty() { continue; }
        let lbl = role_label(&msg.role, msg.name.as_deref());

        // Group consecutive messages from same speaker
        if lbl.as_ref() != last_name {
            out.push_str(&format!("**{}**:\n", lbl));
            last_name = lbl.into_owned();
        }
        for line in content.lines() {
            out.push_str(&format!("> {}\n", line));
        }
        out.push('\n');
    }
    out
}
