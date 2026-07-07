use std::collections::HashMap;
use std::path::PathBuf;

/// In-memory virtual filesystem for blueprint operations.
/// All changes happen here first; only merged to disk on user approval.
pub struct DraftFileSystem {
    files: HashMap<PathBuf, DraftEntry>,
}

pub struct DraftEntry {
    pub content: String,
    pub original: Option<String>,    // original content for diff
    pub author: String,               // which model created it
    pub status: DraftStatus,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DraftStatus {
    Draft,
    Reviewed,
    Approved,
    Rejected,
}

impl DraftFileSystem {
    pub fn new() -> Self {
        Self { files: HashMap::new() }
    }

    pub fn write(&mut self, path: PathBuf, content: String, author: &str) {
        self.files.insert(path, DraftEntry {
            content,
            original: None,
            author: author.to_string(),
            status: DraftStatus::Draft,
        });
    }

    pub fn write_initial(&mut self, path: PathBuf, original: String, content: String, author: &str) {
        self.files.insert(path, DraftEntry {
            content,
            original: Some(original),
            author: author.to_string(),
            status: DraftStatus::Draft,
        });
    }

    pub fn read(&self, path: &PathBuf) -> Option<&str> {
        self.files.get(path).map(|e| e.content.as_str())
    }

    pub fn list(&self) -> Vec<(&PathBuf, &DraftEntry)> {
        let mut entries: Vec<_> = self.files.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0));
        entries
    }

    pub fn diff(&self, path: &PathBuf) -> Option<String> {
        let entry = self.files.get(path)?;
        let original = entry.original.as_deref().unwrap_or("");
        let current = &entry.content;

        let diff = similar::TextDiff::from_lines(original, current);
        Some(diff.unified_diff().to_string())
    }

    pub fn approve(&mut self, path: &PathBuf) -> bool {
        if let Some(entry) = self.files.get_mut(path) {
            entry.status = DraftStatus::Approved;
            true
        } else {
            false
        }
    }

    pub fn reject(&mut self, path: &PathBuf) -> bool {
        if let Some(entry) = self.files.get_mut(path) {
            entry.status = DraftStatus::Rejected;
            true
        } else {
            false
        }
    }

    pub fn is_all_approved(&self) -> bool {
        self.files.values().all(|e| matches!(e.status, DraftStatus::Approved))
    }

    pub fn approved_files(&self) -> Vec<(&PathBuf, &DraftEntry)> {
        self.files
            .iter()
            .filter(|(_, e)| matches!(e.status, DraftStatus::Approved))
            .collect()
    }

    pub fn clear(&mut self) {
        self.files.clear();
    }
}

impl Default for DraftFileSystem {
    fn default() -> Self {
        Self::new()
    }
}
