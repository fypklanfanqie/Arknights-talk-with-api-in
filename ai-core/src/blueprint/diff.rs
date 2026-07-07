use similar::{ChangeTag, TextDiff};

pub fn compute_diff(old: &str, new: &str) -> String {
    let diff = TextDiff::from_lines(old, new);
    diff.unified_diff().to_string()
}

pub fn compute_colored_diff(old: &str, new: &str) -> String {
    let diff = TextDiff::from_lines(old, new);
    let mut output = String::new();

    for change in diff.iter_all_changes() {
        let sign = match change.tag() {
            ChangeTag::Delete => "- ",
            ChangeTag::Insert => "+ ",
            ChangeTag::Equal => "  ",
        };
        output.push_str(&format!("{}{}", sign, change));
    }
    output
}
