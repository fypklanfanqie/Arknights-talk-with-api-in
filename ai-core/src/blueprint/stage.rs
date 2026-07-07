use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Stage {
    Planning,
    Writing,
    Review,
    Testing,
    Merge,
}

impl Stage {
    pub fn name(&self) -> &'static str {
        match self {
            Stage::Planning => "planning",
            Stage::Writing => "writing",
            Stage::Review => "review",
            Stage::Testing => "testing",
            Stage::Merge => "merge",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            Stage::Planning => "Analyzing task and creating implementation plan",
            Stage::Writing => "Generating code for each file",
            Stage::Review => "Reviewing generated code for issues",
            Stage::Testing => "Running tests in sandbox",
            Stage::Merge => "Merging approved changes to disk",
        }
    }

    pub fn order() -> Vec<Stage> {
        vec![
            Stage::Planning,
            Stage::Writing,
            Stage::Review,
            Stage::Testing,
            Stage::Merge,
        ]
    }
}
