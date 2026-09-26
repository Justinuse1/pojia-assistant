// probe.rs — 探针矩阵面板后端：spawn pojia-breaker/tools/probe.py，流式回传进度
// 前端点选 模型×挡位×组别 → 后台跑 → ASR 实时进度 + 结束读 csv 明细。
// 凭证（PROBE_BASE/PROBE_KEY）由前端配置，存 ~/.dsh/probe-config.json（本机工具，明文可接受）。
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::command;

fn dsh_home() -> PathBuf {
    std::env::var("DSH_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(".dsh")
        })
}

/// pojia-breaker 仓库位置（与 GUI 同机的约定路径，可被 probe-config.json 覆盖）
fn breaker_dir() -> PathBuf {
    let cfg = load_config();
    if let Some(d) = cfg.get("breaker_dir") {
        return PathBuf::from(d);
    }
    // 默认：与 ~/.dsh 平级的 pojia-breaker
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    home.join("pojia-breaker")
}

fn config_path() -> PathBuf {
    dsh_home().join("probe-config.json")
}

fn load_config() -> HashMap<String, String> {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[derive(Serialize)]
pub struct ProbeConfig {
    pub base: Option<String>,
    pub key_set: bool,
    pub breaker_dir: Option<String>,
    pub python: Option<String>,
}

#[command]
pub fn probe_config_get() -> ProbeConfig {
    let c = load_config();
    ProbeConfig {
        base: c.get("base").cloned(),
        key_set: c.contains_key("key"),
        breaker_dir: c.get("breaker_dir").cloned(),
        python: c.get("python").cloned(),
    }
}

#[command]
pub fn probe_config_set(
    base: Option<String>,
    key: Option<String>,
    breaker_dir: Option<String>,
    python: Option<String>,
) -> Result<(), String> {
    let mut c = load_config();
    if let Some(v) = base {
        c.insert("base".into(), v);
    }
    if let Some(v) = key {
        if !v.is_empty() {
            c.insert("key".into(), v);
        }
    }
    if let Some(v) = breaker_dir {
        c.insert("breaker_dir".into(), v);
    }
    if let Some(v) = python {
        c.insert("python".into(), v);
    }
    let p = config_path();
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&p, serde_json::to_string_pretty(&c).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/* ─── 运行中的探针任务注册表 ─────────────────────────────────────────── */

#[derive(Serialize, Clone)]
pub struct ProbeLine {
    pub idx: Option<u32>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub probe: Option<String>,
    pub verdict: Option<String>,
    pub note: String,
}

#[derive(Serialize, Clone)]
pub struct ProbeRun {
    pub id: String,
    pub done: bool,
    pub exit_code: Option<i32>,
    pub lines: Vec<ProbeLine>,
    pub asr: Option<f64>,
    pub csv_path: Option<String>,
    pub md_path: Option<String>,
    pub error: Option<String>,
}

struct RunInner {
    child: Option<Child>,
    run: ProbeRun,
}

static RUNS: Mutex<Option<HashMap<String, RunInner>>> = Mutex::new(None);

fn with_runs<T>(f: impl FnOnce(&mut HashMap<String, RunInner>) -> T) -> T {
    let mut g = RUNS.lock().unwrap();
    if g.is_none() {
        *g = Some(HashMap::new());
    }
    f(g.as_mut().unwrap())
}

/// 解析 probe.py 的进度行：
/// `  1 deepseek-chat      high   base  PASS rounds=1 ...` / 汇总 `总 ASR: 62.5% (...)`
fn parse_line(s: &str) -> ProbeLine {
    let clean: String = s
        .replace("\u{1b}[32m", "")
        .replace("\u{1b}[33m", "")
        .replace("\u{1b}[31m", "")
        .replace("\u{1b}[90m", "")
        .replace("\u{1b}[0m", "");
    let t = clean.trim();
    // 进度行: [nnn] model effort probe VERDICT rounds=N note
    if let Some(rest) = t.strip_prefix('[') {
        if let Some(rb) = rest.find(']') {
            let idx: Option<u32> = rest[..rb].trim().parse().ok();
            let parts: Vec<&str> = rest[rb + 1..].split_whitespace().collect();
            if parts.len() >= 5 {
                return ProbeLine {
                    idx,
                    model: Some(parts[0].into()),
                    effort: Some(parts[1].into()),
                    probe: Some(parts[2].into()),
                    verdict: Some(parts[3].into()),
                    note: parts[4..].join(" "),
                };
            }
        }
    }
    // 汇总行: 总 ASR: 62.5% (5/8)
    if t.contains("总 ASR") {
        let pct: Option<f64> = t
            .split('%')
            .next()
            .and_then(|seg| seg.rsplit([' ', ':']).next())
            .and_then(|x| x.trim().parse().ok());
        if let Some(p) = pct {
            return ProbeLine { idx: None, model: None, effort: None, probe: None, verdict: None, note: format!("ASR {p}%") };
        }
    }
    ProbeLine { idx: None, model: None, effort: None, probe: None, verdict: None, note: t.to_string() }
}

#[derive(Serialize)]
pub struct ProbeStart {
    pub ok: bool,
    pub run_id: Option<String>,
    pub error: Option<String>,
}

/// 启动一次探针矩阵。models/efforts 空则用 probe.py 默认。
#[command]
pub fn probe_run(
    models: Vec<String>,
    efforts: Vec<String>,
    variant: String,
    group: String,
    quick: bool,
) -> ProbeStart {
    let cfg = load_config();
    let base = match cfg.get("base") {
        Some(b) if !b.is_empty() => b.clone(),
        _ => return ProbeStart { ok: false, run_id: None, error: Some("未配置探针 base（右上设置里填）".into()) },
    };
    let key = match cfg.get("key") {
        Some(k) if !k.is_empty() => k.clone(),
        _ => return ProbeStart { ok: false, run_id: None, error: Some("未配置探针 key".into()) },
    };
    let dir = breaker_dir();
    let script = dir.join("tools").join("probe.py");
    if !script.exists() {
        return ProbeStart { ok: false, run_id: None, error: Some(format!("找不到 {}", script.display())) };
    }
    let python = cfg.get("python").cloned().unwrap_or_else(|| "python".into());

    let mut cmd = Command::new(&python);
    cmd.arg(&script)
        .arg("--variant").arg(&variant)
        .arg("--group").arg(&group)
        .env("PROBE_BASE", &base)
        .env("PROBE_KEY", &key)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if !models.is_empty() {
        cmd.arg("--models").args(&models);
    }
    if !efforts.is_empty() {
        cmd.arg("--efforts").args(&efforts);
    }
    if quick {
        cmd.arg("--quick");
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return ProbeStart { ok: false, run_id: None, error: Some(format!("启动 python 失败: {e}")) },
    };
    let stdout = child.stdout.take().unwrap();
    let id = format!("run-{}", chrono_secs());
    let run = ProbeRun {
        id: id.clone(),
        done: false,
        exit_code: None,
        lines: Vec::new(),
        asr: None,
        csv_path: None,
        md_path: None,
        error: None,
    };
    with_runs(|m| {
        m.insert(id.clone(), RunInner { child: Some(child), run });
    });

    // 读 stdout 的线程：逐行解析推进度；进程退出后找最新 csv/md
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut lines: Vec<ProbeLine> = Vec::new();
        let mut reader = BufReader::new(stdout);
        let mut buf = String::new();
        loop {
            buf.clear();
            match reader.read_line(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if !buf.trim().is_empty() {
                        lines.push(parse_line(&buf));
                    }
                }
            }
        }
        let status = with_runs(|m| {
            let r = m.get_mut(&id2).expect("run gone");
            if let Some(c) = r.child.as_mut() {
                let code = c.wait().ok().and_then(|s| s.code());
                r.run.exit_code = code;
            }
            r.run.done = true;
            // 进度里的 ASR 行
            r.run.asr = lines.iter().rev().find_map(|l| {
                l.note.strip_prefix("ASR ").and_then(|x| x.strip_suffix('%')).and_then(|x| x.parse().ok())
            });
            r.run.lines = lines.clone();
            r.child = None;
            // 找 tools/ 下最新的报告（按修改时间）
            let tools = breaker_dir().join("tools");
            let newest = |prefix: &str| -> Option<String> {
                let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
                if let Ok(rd) = std::fs::read_dir(&tools) {
                    for e in rd.flatten() {
                        let name = e.file_name().to_string_lossy().into_owned();
                        if name.starts_with(prefix) {
                            if let Ok(md) = e.metadata().and_then(|m| m.modified()) {
                                if best.as_ref().map(|(t, _)| md > *t).unwrap_or(true) {
                                    best = Some((md, e.path()));
                                }
                            }
                        }
                    }
                }
                best.map(|(_, p)| p.to_string_lossy().into_owned())
            };
            r.run.csv_path = newest("probe_detail_");
            r.run.md_path = newest("probe_report_");
            r.run.id.clone()
        });
        let _ = status;
    });

    ProbeStart { ok: true, run_id: Some(id), error: None }
}

/// 轮询进度
#[command]
pub fn probe_status(run_id: String) -> Result<ProbeRun, String> {
    with_runs(|m| m.get(&run_id).map(|r| r.run.clone()).ok_or_else(|| "no such run".to_string()))
}

/// 读明细 csv（probe.py 落的 probe_detail_*.csv）
#[command]
pub fn probe_results(run_id: String) -> Result<String, String> {
    let csv = with_runs(|m| m.get(&run_id).and_then(|r| r.run.csv_path.clone()))
        .ok_or("run 未完成或无报告")?;
    std::fs::read_to_string(&csv).map_err(|e| e.to_string())
}

/// 打开报告目录（资源管理器）
#[command]
pub fn probe_open_reports() -> Result<(), String> {
    let dir = breaker_dir().join("tools");
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(dir).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn chrono_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
