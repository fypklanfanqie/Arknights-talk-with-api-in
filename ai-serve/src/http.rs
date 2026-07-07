use std::convert::Infallible;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;

use axum::{
    Router,
    extract::State,
    response::sse::{Event, Sse},
    routing::{get, post},
    Json,
};
use serde::Deserialize;
use tokio::sync::{broadcast, Mutex};
use tokio_stream::Stream;
use tower_http::cors::{Any, CorsLayer};

use ai_core::config::AgentConfig;
use ai_core::interface::agent_handle::AgentHandle;
use ai_core::interface::output::KernelOutput;
use crate::protocol::{event_to_json, kernel_to_event};

#[derive(Debug, Deserialize)]
struct ThinkRequest {
    prompt: String,
}

#[derive(Debug, Deserialize)]
struct ConfigureRequest {
    providers: Vec<ProviderDef>,
    #[serde(default)]
    share_context: bool,
    #[serde(default)]
    speed: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ProviderDef {
    id: String,
    api_key: String,
    model: Option<String>,
    system_prompt: Option<String>,
    speed: Option<f64>,
}

struct SceneStream {
    rx: broadcast::Receiver<String>,
}

impl Stream for SceneStream {
    type Item = Result<Event, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match self.rx.try_recv() {
            Ok(json) => Poll::Ready(Some(Ok(Event::default().data(json)))),
            Err(broadcast::error::TryRecvError::Empty) => {
                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Err(_) => Poll::Ready(None),
        }
    }
}

struct AppState {
    event_tx: broadcast::Sender<String>,
    agent: Mutex<AgentHandle>,
}

pub async fn run_http(addr: &str) -> anyhow::Result<()> {
    let config = match AgentConfig::load() {
        Ok(c) => c,
        Err(_) => {
            std::fs::write(
                "./.clusai.toml",
                "[agent]\ndefault_mode = \"roundtable\"\n\n[[providers]]\nid = \"placeholder\"\ntype = \"deepseek\"\nmodel = \"deepseek-chat\"\napi_key = \"sk-placeholder\"\n",
            )?;
            AgentConfig::load()?
        }
    };
    let agent = AgentHandle::spawn(config).await?;

    let (event_tx, _) = broadcast::channel::<String>(256);

    let state = Arc::new(AppState {
        event_tx: event_tx.clone(),
        agent: Mutex::new(agent),
    });

    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/events", get(sse_handler))
        .route("/think", post(think_handler))
        .route("/configure", post(configure_handler))
        .route("/ping", get(|| async { "pong" }))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("[ai-serve] HTTP listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn sse_handler(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_tx.subscribe();
    Sse::new(SceneStream { rx })
        .keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(5))
                .text("ping"),
        )
}

async fn think_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ThinkRequest>,
) -> String {
    let tx = state.event_tx.clone();
    let agent = state.agent.lock().await;
    if agent.send_message(&req.prompt).is_err() {
        return r#"{"error":"agent channel closed"}"#.into();
    }
    drop(agent);

    tokio::spawn(async move {
        loop {
            let mut agent = state.agent.lock().await;
            match agent.recv().await {
                Ok(out) => {
                    let done = matches!(out, KernelOutput::MessageComplete { .. } | KernelOutput::Error { .. } | KernelOutput::RoundtableComplete { .. });
                    if let Some(evt) = kernel_to_event(out) {
                        let _ = tx.send(event_to_json(&evt));
                    }
                    if done {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    r#"{"status":"ok"}"#.into()
}

async fn configure_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ConfigureRequest>,
) -> String {
    let mut toml = String::from("[agent]\ndefault_mode = \"roundtable\"\nmax_history = 30\n\n");

    toml.push_str("[tools]\nread_enabled = false\nwrite_enabled = false\nbash_enabled = false\nconversation_pace = true\n\n");

    for p in &req.providers {
        toml.push_str("[[providers]]\n");
        toml.push_str(&format!("id = \"{}\"\n", p.id));
        toml.push_str("type = \"deepseek\"\n");
        toml.push_str(&format!("model = \"{}\"\n", p.model.as_deref().unwrap_or("deepseek-chat")));
        toml.push_str(&format!("api_key = \"{}\"\n", p.api_key));
        if let Some(ref sp) = p.system_prompt {
            let escaped = sp.replace('\\', "\\\\").replace('"', "\\\"");
            toml.push_str(&format!("system_prompt = \"{}\"\n", escaped));
        }
        if let Some(s) = p.speed.or(req.speed) {
            toml.push_str(&format!("speed = {}\n", s));
        }
        toml.push('\n');
    }

    toml.push_str("[roundtable]\n");
    toml.push_str(&format!("share_context = {}\n", req.share_context));

    if let Err(e) = std::fs::write("./.clusai.toml", &toml) {
        return format!("{{\"error\":\"write config: {}\"}}", e);
    }

    // restart agent with new config
    match AgentConfig::load() {
        Ok(config) => match AgentHandle::spawn(config).await {
            Ok(new_agent) => {
                let mut agent = state.agent.lock().await;
                let _ = std::mem::replace(&mut *agent, new_agent);
                drop(agent);
            }
            Err(e) => return format!("{{\"error\":\"spawn agent: {}\"}}", e),
        },
        Err(e) => return format!("{{\"error\":\"load config: {}\"}}", e),
    }

    r#"{"status":"ok"}"#.into()
}
