use thiserror::Error;

#[derive(Error, Debug)]
pub enum AgentError {
    #[error("configuration error: {0}")]
    Config(String),

    #[error("provider error: {0}")]
    Provider(String),

    #[error("tool error: {name} - {message}")]
    Tool { name: String, message: String },

    #[error("blueprint error: {0}")]
    Blueprint(String),

    #[error("mcp error: {0}")]
    Mcp(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("toml parse error: {0}")]
    Toml(#[from] toml::de::Error),

    #[error("recoverable: {0}")]
    Recoverable(String),

    #[error("fatal: {0}")]
    Fatal(String),
}

pub type AgentResult<T> = Result<T, AgentError>;
