use std::collections::HashMap;

use crate::error::{AgentError, AgentResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentConfig {
    #[serde(default)]
    pub agent: AgentSettings,

    #[serde(default)]
    pub providers: Vec<ProviderConfig>,

    #[serde(default)]
    pub mcp_servers: Vec<McpServerConfig>,

    #[serde(default)]
    pub tools: ToolSettings,

    #[serde(default)]
    pub blueprint: BlueprintSettings,

    #[serde(default)]
    pub roundtable: RoundtableSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSettings {
    #[serde(default = "default_system_prompt")]
    pub system_prompt: String,

    #[serde(default = "default_max_history")]
    pub max_history: usize,

    #[serde(default = "default_mode")]
    pub default_mode: ChatMode,

    #[serde(default = "default_provider")]
    pub default_provider: String,

    #[serde(default)]
    pub working_dir: Option<PathBuf>,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            system_prompt: default_system_prompt(),
            max_history: default_max_history(),
            default_mode: default_mode(),
            default_provider: default_provider(),
            working_dir: None,
        }
    }
}

fn default_system_prompt() -> String {
    "You are an AI coding assistant. You help users write, review, and debug code.\n\
     Use tools when you need to read files, search code, or execute shell commands.\n\
     Always explain your reasoning briefly before writing code.".into()
}
fn default_max_history() -> usize { 50 }
fn default_mode() -> ChatMode { ChatMode::Single }
fn default_provider() -> String { "default".into() }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChatMode {
    Single,
    Roundtable,
    Blueprint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,

    #[serde(rename = "type")]
    pub provider_type: ProviderType,

    pub model: String,

    #[serde(default)]
    pub api_key: Option<String>,

    #[serde(default)]
    pub api_key_env: Option<String>,

    #[serde(default)]
    pub system_prompt: Option<String>,

    #[serde(default)]
    pub system_prompt_file: Option<PathBuf>,

    #[serde(default)]
    pub base_url: Option<String>,

    #[serde(default = "default_temperature")]
    pub temperature: f32,

    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,

    #[serde(default = "default_speed")]
    pub speed: f64,
}

fn default_speed() -> f64 { 1.0 }

fn default_temperature() -> f32 { 0.7 }
fn default_max_tokens() -> u32 { 8192 }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Ollama,
    DeepSeek,
    #[serde(rename = "openai-compatible")]
    OpenAICompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,

    #[serde(default)]
    pub enabled: bool,

    #[serde(rename = "type")]
    pub server_type: McpServerType,

    #[serde(default)]
    pub command: Vec<String>,

    #[serde(default)]
    pub url: Option<String>,

    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum McpServerType {
    Local,
    Remote,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ToolSettings {
    #[serde(default = "default_true")]
    pub read_enabled: bool,

    #[serde(default = "default_true")]
    pub write_enabled: bool,

    #[serde(default = "default_true")]
    pub edit_enabled: bool,

    #[serde(default = "default_true")]
    pub grep_enabled: bool,

    #[serde(default = "default_true")]
    pub glob_enabled: bool,

    #[serde(default)]
    pub bash_enabled: bool,

    #[serde(default)]
    pub allow_paths: Vec<PathBuf>,

    #[serde(default)]
    pub deny_paths: Vec<PathBuf>,

    #[serde(flatten)]
    pub capabilities: HashMap<String, bool>,
}

fn default_true() -> bool { true }

impl Default for BlueprintSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            default_mode: BlueprintMode::Orchestrator,
            architect: None,
            reviewer: None,
            workers: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlueprintSettings {
    #[serde(default)]
    pub enabled: bool,

    #[serde(default = "default_blueprint_mode")]
    pub default_mode: BlueprintMode,

    #[serde(default)]
    pub architect: Option<String>,

    #[serde(default)]
    pub reviewer: Option<String>,

    #[serde(default)]
    pub workers: Vec<WorkerConfig>,
}

fn default_blueprint_mode() -> BlueprintMode { BlueprintMode::Orchestrator }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BlueprintMode {
    Orchestrator,
    Debate,
    Consensus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerConfig {
    pub provider: String,

    #[serde(default)]
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoundtableSettings {
    #[serde(default)]
    pub order: Vec<String>,

    #[serde(default)]
    pub share_context: bool,
}

impl AgentConfig {
    const PROJECT_FILES: &[&str] = &[".clusai.toml", "clusai.toml"];
    const USER_FILE: &str = "config.toml";

    pub fn load() -> AgentResult<Self> {
        let mut config = Self::default();

        if let Some(user_path) = Self::user_config_path() {
            if user_path.exists() {
                let user_raw = std::fs::read_to_string(&user_path)
                    .map_err(|e| AgentError::Config(format!("cannot read {:?}: {e}", user_path)))?;
                let user_cfg: Self = toml::from_str(&user_raw)?;
                config.merge(user_cfg);
            }
        }

        for name in Self::PROJECT_FILES {
            let project_path = Path::new(name);
            if project_path.exists() {
                let project_raw = std::fs::read_to_string(project_path)
                    .map_err(|e| AgentError::Config(format!("cannot read {:?}: {e}", project_path)))?;
                let project_cfg: Self = toml::from_str(&project_raw)?;
                config.merge(project_cfg);
                break; // only load the first matching project config
            }
        }

        config.validate()?;
        config.resolve_persona_files()?;
        config.register_speeds();
        Ok(config)
    }

    pub fn load_from(path: &Path) -> AgentResult<Self> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| AgentError::Config(format!("cannot read {path:?}: {e}")))?;
        let mut config: Self = toml::from_str(&raw)?;
        config.validate()?;
        config.resolve_persona_files()?;
        config.register_speeds();
        Ok(config)
    }

    fn register_speeds(&self) {
        let map: std::collections::HashMap<String, f64> = self
            .providers
            .iter()
            .map(|p| (p.id.clone(), p.speed))
            .collect();
        crate::kernel::register_speeds(map);
        crate::kernel::tools::pause::install();
    }

    fn user_config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|d| d.join("clusai").join(Self::USER_FILE))
    }

    fn merge(&mut self, other: Self) {
        self.providers.extend(other.providers);
        self.mcp_servers.extend(other.mcp_servers);

        if !other.blueprint.workers.is_empty() || other.blueprint.enabled {
            self.blueprint.enabled = other.blueprint.enabled;
            self.blueprint.default_mode = other.blueprint.default_mode;
        }
        self.blueprint.workers.extend(other.blueprint.workers);

        if !other.roundtable.order.is_empty() {
            self.roundtable.order = other.roundtable.order;
        }
        self.roundtable.share_context = other.roundtable.share_context;

        if other.agent.system_prompt != AgentConfig::default().agent.system_prompt {
            self.agent.system_prompt = other.agent.system_prompt;
        }
        if other.agent.max_history != 50 {
            self.agent.max_history = other.agent.max_history;
        }
        if other.agent.default_provider != "default" {
            self.agent.default_provider = other.agent.default_provider;
        }
        if other.agent.default_mode != ChatMode::Single {
            self.agent.default_mode = other.agent.default_mode;
        }
        if other.agent.working_dir.is_some() {
            self.agent.working_dir = other.agent.working_dir;
        }

        if other.blueprint.architect.is_some() {
            self.blueprint.architect = other.blueprint.architect;
        }
        if other.blueprint.reviewer.is_some() {
            self.blueprint.reviewer = other.blueprint.reviewer;
        }

        // ── tools: preserve lower-priority capabilities ──
        let prior_caps = std::mem::take(&mut self.tools.capabilities);
        if other.tools != ToolSettings::default() {
            self.tools = other.tools;
        }
        for (k, v) in prior_caps {
            self.tools.capabilities.entry(k).or_insert(v);
        }
    }

    fn validate(&self) -> AgentResult<()> {
        if self.providers.is_empty() {
            return Err(AgentError::Config("at least one provider must be configured".into()));
        }

        for p in &self.providers {
            if p.id.is_empty() {
                return Err(AgentError::Config("provider id must not be empty".into()));
            }
            if p.model.is_empty() {
                return Err(AgentError::Config(format!("provider '{}' must specify a model", p.id)));
            }
            if p.provider_type != ProviderType::Ollama
                && p.api_key.is_none()
                && p.api_key_env.is_none()
            {
                return Err(AgentError::Config(format!(
                    "provider '{}' requires api_key or api_key_env",
                    p.id
                )));
            }
        }

        if self.agent.default_provider != "default" {
            let ids: Vec<&str> = self.providers.iter().map(|p| p.id.as_str()).collect();
            if !ids.contains(&self.agent.default_provider.as_str()) {
                return Err(AgentError::Config(format!(
                    "default_provider '{}' not found in providers list",
                    self.agent.default_provider
                )));
            }
        }

        for provider_id in &self.roundtable.order {
            let found = self.providers.iter().any(|p| &p.id == provider_id);
            if !found {
                return Err(AgentError::Config(format!(
                    "roundtable order references unknown provider '{}'",
                    provider_id
                )));
            }
        }

        Ok(())
    }

    pub fn first_provider_id(&self) -> &str {
        if self.agent.default_provider != "default" {
            &self.agent.default_provider
        } else {
            &self.providers[0].id
        }
    }

    pub fn find_provider(&self, id: &str) -> Option<&ProviderConfig> {
        self.providers.iter().find(|p| p.id == id)
    }

    pub fn enabled_capability_names(&self) -> Vec<String> {
        self.tools.capabilities.iter()
            .filter(|(_, &on)| on)
            .map(|(k, _)| k.clone())
            .collect()
    }

    fn resolve_persona_files(&mut self) -> AgentResult<()> {
        for p in &mut self.providers {
            let Some(ref path) = p.system_prompt_file else { continue };
            let raw = std::fs::read_to_string(path)
                .map_err(|e| AgentError::Config(format!(
                    "cannot read persona file {:?} for provider '{}': {e}", path, p.id
                )))?;
            let value: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|e| AgentError::Config(format!(
                    "invalid JSON in persona file {:?} for provider '{}': {e}", path, p.id
                )))?;

            // JSON with explicit system_prompt field (simple persona)
            if let Some(sp) = value.get("system_prompt").and_then(|v| v.as_str()) {
                p.system_prompt = Some(sp.to_string());
            } else {
                // Structured persona: auto-generate system prompt from available fields
                p.system_prompt = Some(build_persona_prompt(&value));
            }

            if let Some(t) = value.get("temperature").and_then(|v| v.as_f64()) {
                p.temperature = t as f32;
            }
            if let Some(mt) = value.get("max_tokens").and_then(|v| v.as_u64()) {
                p.max_tokens = mt as u32;
            }
        }
        Ok(())
    }
}

fn build_persona_prompt(data: &serde_json::Value) -> String {
    let name = data.get("name").and_then(|v| v.as_str()).unwrap_or("character");
    let mut p = String::with_capacity(1024);
    p.push_str("你是");
    p.push_str(name);
    p.push_str("。");

    if let Some(desc) = data.get("description") {
        if let Some(aff) = desc.get("affiliation").and_then(|v| v.as_str()) {
            p.push_str(" 身份：");
            p.push_str(aff);
            p.push('。');
        }
        if let Some(h) = desc.get("height").and_then(|v| v.as_str()) {
            p.push_str(" 身高");
            p.push_str(h);
            p.push('。');
        }
    }

    if let Some(personality) = data.get("personality") {
        if let Some(core) = personality.get("core").and_then(|v| v.as_array()) {
            let traits: Vec<&str> = core.iter().filter_map(|v| v.as_str()).collect();
            if !traits.is_empty() {
                p.push_str(" 性格：");
                p.push_str(&traits.join("、"));
                p.push('。');
            }
        }
        if let Some(inner) = personality.get("inner_world").and_then(|v| v.as_str()) {
            p.push(' ');
            p.push_str(inner);
        }
        if let Some(style) = personality.get("speaking_style").and_then(|v| v.as_str()) {
            p.push_str(" 说话风格：");
            p.push_str(style);
        }
        if let Some(daily) = personality.get("daily_life").and_then(|v| v.as_str()) {
            p.push(' ');
            p.push_str(daily);
        }
    }

    if let Some(rels) = data.get("relationships").and_then(|v| v.as_object()) {
        for (who, rel) in rels {
            if let Some(desc) = rel.as_str() {
                p.push_str(" 与");
                p.push_str(who);
                p.push_str("的关系：");
                p.push_str(desc);
            }
        }
    }

    if let Some(wv) = data.get("worldview").and_then(|v| v.get("core_belief")).and_then(|v| v.as_str()) {
        p.push_str(" 核心信念：");
        p.push_str(wv);
        p.push('。');
    }

    if let Some(ls) = data.get("life_story") {
        if let Some(origin) = ls.get("origin").and_then(|v| v.as_str()) {
            p.push_str(" 出身：");
            p.push_str(origin);
            p.push('。');
        }
        if let Some(events) = ls.get("key_events").and_then(|v| v.as_array()) {
            p.push_str(" 重要经历：");
            for e in events.iter().take(5) {
                if let Some(s) = e.as_str() {
                    p.push_str(s);
                    p.push('。');
                }
            }
        }
    }

    p.push_str(" 你必须完全按照以上设定回答，绝不可脱离角色。只说中文。");
    p
}
