// speedtest.rs — 多中转测速: 对每个中转的每个模型发最小补全, 量延迟+可用性
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct RelayResult {
    pub name: String,
    pub base: String,
    pub model: String,
    pub ok: bool,
    pub latency_ms: u32,
    pub error: String,
}

fn relays_path() -> std::path::PathBuf {
    let cwd = std::env::current_dir().unwrap_or_default();
    let mut p = cwd.clone();
    for _ in 0..6 {
        let c = p.join("src-tauri").join("relays.json");
        if c.exists() { return c; }
        p = match p.parent() { Some(x) => x.to_path_buf(), None => break };
    }
    cwd.join("src-tauri").join("relays.json")
}

fn probe_relay_sync(name: &str, base: &str, key: &str, model: &str) -> RelayResult {
    let url = format!("{}/chat/completions", base.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
    });
    let t0 = std::time::Instant::now();
    let res = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(20))
        .set("Authorization", &format!("Bearer {key}"))
        .send_json(body);
    let latency_ms = t0.elapsed().as_millis() as u32;
    match res {
        Ok(_) => RelayResult {
            name: name.into(),
            base: base.into(),
            model: model.into(),
            ok: true,
            latency_ms,
            error: String::new(),
        },
        Err(ureq::Error::Status(code, _)) => RelayResult {
            name: name.into(),
            base: base.into(),
            model: model.into(),
            ok: false,
            latency_ms,
            error: format!("HTTP {code}"),
        },
        Err(e) => RelayResult {
            name: name.into(),
            base: base.into(),
            model: model.into(),
            ok: false,
            latency_ms,
            error: e.to_string(),
        },
    }
}

#[tauri::command]
pub async fn speedtest_run() -> Result<Vec<RelayResult>, String> {
    let p = relays_path();
    let text = std::fs::read_to_string(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
    let cfg: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    // 测速放阻塞线程池, 避免卡UI
    let mut jobs: Vec<(String, String, String, String)> = Vec::new();
    if let Some(relays) = cfg.get("relays").and_then(|v| v.as_array()) {
        for r in relays {
            let name = r.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string();
            let base = r.get("base").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let key = r.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string();
            for m in r.get("models").and_then(|v| v.as_array()).unwrap_or(&vec![]) {
                if let Some(m) = m.as_str() {
                    jobs.push((name.clone(), base.clone(), key.clone(), m.to_string()));
                }
            }
        }
    }
    let handle = tauri::async_runtime::spawn_blocking(move || {
        jobs.iter().map(|(n, b, k, m)| probe_relay_sync(n, b, k, m)).collect::<Vec<_>>()
    });
    handle.await.map_err(|e| e.to_string())
}
