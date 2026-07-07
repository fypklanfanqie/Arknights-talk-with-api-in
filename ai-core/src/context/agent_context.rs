use crate::config::AgentConfig;
use crate::message::Message;
use std::path::PathBuf;
use std::sync::Arc;

pub struct AgentContext {
    pub config: Arc<AgentConfig>,
    pub history: Vec<Message>,
    pub working_dir: PathBuf,
    cached_allow: Vec<PathBuf>,
    cached_deny: Vec<PathBuf>,
}

impl AgentContext {
    pub fn new(config: Arc<AgentConfig>) -> Self {
        let working_dir = config
            .agent
            .working_dir
            .clone()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

        let canon = |p: &PathBuf| p.canonicalize().unwrap_or_else(|_| p.clone());
        let cached_allow: Vec<_> = if config.tools.allow_paths.is_empty() {
            vec![canon(&working_dir)]
        } else {
            config.tools.allow_paths.iter().map(canon).collect()
        };
        let cached_deny: Vec<_> = config.tools.deny_paths.iter().map(canon).collect();

        let mut ctx = Self {
            config,
            history: vec![],
            working_dir,
            cached_allow,
            cached_deny,
        };
        ctx.reset_history();
        ctx
    }

    pub fn tool_context(&self) -> crate::tool::ToolContext {
        crate::tool::ToolContext {
            working_dir: self.working_dir.clone(),
            allow_paths: self.cached_allow.clone(),
            deny_paths: self.cached_deny.clone(),
        }
    }

    pub fn reset_history(&mut self) {
        self.history.clear();
        let prompt = self.config.agent.system_prompt.clone();
        if !prompt.is_empty() {
            self.history.push(Message::system(prompt));
        }
    }

    /// Replace the system prompt (first message in history) with a custom one.
    /// Used to give different providers different identities.
    pub fn set_system_prompt(&mut self, prompt: &str) {
        if self.history.first().map(|m| m.role == crate::message::Role::System).unwrap_or(false) {
            self.history[0] = Message::system(prompt);
        } else {
            self.history.insert(0, Message::system(prompt));
        }
    }

    pub fn push_user(&mut self, content: &str) -> &Message {
        let msg = Message::user(content);
        self.history.push(msg);
        self.trim_history();
        self.history.last().unwrap()
    }

    pub fn push_assistant(&mut self, content: &str) {
        self.history.push(Message::assistant(content));
        self.trim_history();
    }

    pub fn push_tool(&mut self, call_id: &str, name: &str, content: &str) {
        self.history.push(Message::tool(call_id, name, content));
    }

    pub fn push_assistant_with_tools(
        &mut self,
        content: Option<String>,
        tool_calls: Vec<crate::message::ToolCall>,
    ) {
        let msg = if let Some(text) = content {
            Message::assistant(text)
        } else {
            let mut msg = Message::assistant("");
            msg.tool_calls = tool_calls;
            msg.content = None;
            msg
        };
        self.history.push(msg);
        self.trim_history();
    }

    fn trim_history(&mut self) {
        let max = self.config.agent.max_history;
        if self.history.len() <= max {
            return;
        }
        let is_system = self
            .history
            .first()
            .map(|m| m.role == crate::message::Role::System)
            .unwrap_or(false);
        let system_offset = if is_system { 1 } else { 0 };
        let non_system_count = self.history.len() - system_offset;
        if non_system_count > max {
            let excess = non_system_count - max;
            self.history.drain(system_offset..system_offset + excess);
        }
    }

    pub fn tool_allow_paths(&self) -> Vec<PathBuf> {
        let mut paths = self.config.tools.allow_paths.clone();
        if paths.is_empty() {
            paths.push(self.working_dir.clone());
        }
        paths
    }

    pub fn tool_deny_paths(&self) -> Vec<PathBuf> {
        self.config.tools.deny_paths.clone()
    }

    pub fn resolve_path(&self, path: &str) -> PathBuf {
        let p = std::path::Path::new(path);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            self.working_dir.join(p)
        }
    }

    pub fn is_path_allowed(&self, path: &std::path::Path) -> bool {
        let canonical = match path.canonicalize() {
            Ok(p) => p,
            Err(_) => return false,
        };
        for deny in &self.config.tools.deny_paths {
            let deny_canon = match deny.canonicalize() {
                Ok(d) => d,
                Err(_) => continue,
            };
            if canonical.starts_with(&deny_canon) {
                return false;
            }
        }
        let allow = self.tool_allow_paths();
        if allow.is_empty() {
            return true;
        }
        for a in &allow {
            let allow_canon = match a.canonicalize() {
                Ok(a) => a,
                Err(_) => continue,
            };
            if canonical.starts_with(&allow_canon) {
                return true;
            }
        }
        false
    }
}
