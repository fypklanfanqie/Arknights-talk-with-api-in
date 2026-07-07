use crate::message::Message;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    #[serde(default)]
    pub topic: String,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub model_ids: Vec<String>,
    #[serde(default)]
    pub messages: Vec<Message>,
}

#[derive(Debug, Clone)]
pub struct SessionMeta {
    pub id: String,
    pub topic: String,
    pub model_ids: Vec<String>,
    pub message_count: usize,
}

pub struct SessionStore {
    dir: PathBuf,
}

impl SessionStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn default_dir() -> Option<PathBuf> {
        dirs::config_dir().map(|d| d.join("clusai").join("sessions"))
    }

    pub fn list(&self) -> io::Result<Vec<SessionMeta>> {
        fs::create_dir_all(&self.dir)?;
        let mut metas = Vec::new();
        for entry in fs::read_dir(&self.dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") { continue; }
            let id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("?").to_string();
            match fs::read_to_string(&path) {
                Ok(raw) => {
                    if let Ok(session) = serde_json::from_str::<Session>(&raw) {
                        metas.push(SessionMeta {
                            id,
                            topic: session.topic,
                            model_ids: session.model_ids,
                            message_count: session.messages.len(),
                        });
                    }
                }
                Err(_) => continue,
            }
        }
        metas.sort_by(|a, b| b.id.cmp(&a.id)); // newest first
        Ok(metas)
    }

    pub fn save(&self, session: &Session) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        let path = self.dir.join(format!("{}.json", sanitize(&session.id)));
        let raw = serde_json::to_string_pretty(session)?;
        fs::write(path, raw)
    }

    pub fn load(&self, id: &str) -> io::Result<Session> {
        let path = self.dir.join(format!("{}.json", sanitize(id)));
        let raw = fs::read_to_string(path)?;
        serde_json::from_str(&raw).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    pub fn delete(&self, id: &str) -> io::Result<()> {
        let path = self.dir.join(format!("{}.json", sanitize(id)));
        fs::remove_file(path)
    }

    pub fn auto_id() -> String {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        format!("{}", now)
    }
}

fn sanitize(name: &str) -> String {
    name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
}
