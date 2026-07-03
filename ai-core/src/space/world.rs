use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

type WorldData = Arc<RwLock<HashMap<String, Value>>>;

#[derive(Clone, Default)]
pub struct WorldRegistry {
    worlds: Arc<RwLock<HashMap<String, WorldData>>>,
}

impl WorldRegistry {
    pub fn new() -> Self {
        Self { worlds: Arc::new(RwLock::new(HashMap::new())) }
    }

    pub async fn create(&self, name: &str) -> bool {
        let mut worlds = self.worlds.write().await;
        if worlds.contains_key(name) { return false; }
        worlds.insert(name.to_string(), Arc::new(RwLock::new(HashMap::new())));
        true
    }

    pub async fn get(&self, world: &str, key: &str) -> Option<Value> {
        self.worlds.read().await.get(world)?.read().await.get(key).cloned()
    }

    pub async fn set(&self, world: &str, key: &str, value: Value) {
        let entry = {
            let worlds = self.worlds.read().await;
            worlds.get(world).cloned()
        };
        if let Some(data) = entry { data.write().await.insert(key.to_string(), value); }
    }

    pub async fn remove_world(&self, name: &str) { self.worlds.write().await.remove(name); }

    pub async fn remove_key(&self, world: &str, key: &str) {
        if let Some(data) = self.worlds.read().await.get(world) {
            data.write().await.remove(key);
        }
    }

    pub async fn snapshot(&self, world: &str) -> HashMap<String, Value> {
        if let Some(data) = self.worlds.read().await.get(world) {
            data.read().await.clone()
        } else {
            HashMap::new()
        }
    }

    pub async fn clear(&self, world: &str) {
        if let Some(data) = self.worlds.read().await.get(world) { data.write().await.clear(); }
    }

    pub async fn names(&self) -> Vec<String> {
        self.worlds.read().await.keys().cloned().collect()
    }

    pub fn inner(&self) -> Arc<RwLock<HashMap<String, WorldData>>> { self.worlds.clone() }
}
