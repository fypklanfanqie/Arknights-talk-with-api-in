mod protocol;
mod stdio;
mod http;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter("ai_serve=info").init();

    let args: Vec<String> = std::env::args().collect();

    if args.len() >= 2 && args[1] == "--http" {
        let addr = if args.len() >= 3 && !args[2].is_empty() {
            let a = &args[2];
            if a.starts_with(':') { format!("127.0.0.1{a}") } else { a.clone() }
        } else {
            "127.0.0.1:9800".to_string()
        };
        http::run_http(&addr).await
    } else {
        stdio::run_stdio().await
    }
}
