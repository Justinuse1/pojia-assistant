// report.rs — 战果引擎: 扫描 pojia-breaker 探针报告 + 弹药库统计, 汇聚成战报数据
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct ProbeReport {
    pub file: String,
    pub time: String,
    pub variant: String,
    pub model: String,
    pub tiers: String,
    pub asr: String,
    pub pass_count: u32,
    pub fail_count: u32,
}

#[derive(Serialize)]
pub struct ReportData {
    pub reports: Vec<ProbeReport>,
    pub ammo_count: u32,
    pub ammo_verified: u32,
}

fn breaker_tools() -> std::path::PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    let p = std::path::PathBuf::from(format!("{home}\\pojia-breaker\\tools"));
    if p.exists() {
        return p;
    }
    std::path::PathBuf::from("C:\\Users\\53241\\pojia-breaker\\tools")
}

#[tauri::command]
pub async fn report_scan() -> Result<ReportData, String> {
    let mut reports = Vec::new();
    let tools = breaker_tools();
    if let Ok(rd) = std::fs::read_dir(&tools) {
        let mut files: Vec<_> = rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.file_name().map_or(false, |n| {
                    let s = n.to_string_lossy();
                    s.starts_with("probe_report_") && s.ends_with(".md")
                })
            })
            .collect();
        files.sort();
        for p in files.iter().rev().take(20) {
            let text = std::fs::read_to_string(p).unwrap_or_default();
            let name = p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let time = text
                .lines()
                .find(|l| l.contains("20") && l.trim_start_matches('#').len() < 60)
                .unwrap_or("")
                .trim_start_matches('#')
                .trim()
                .to_string();
            let variant_line = text.lines().find(|l| l.contains("变体")).unwrap_or("");
            let grab = |key: &str| {
                variant_line
                    .split(key)
                    .nth(1)
                    .map(|s| s.split('|').next().unwrap_or("").trim().to_string())
                    .unwrap_or_default()
            };
            let asr_line = text.lines().find(|l| l.contains("总 ASR")).unwrap_or("");
            let asr = asr_line.split("**").nth(1).unwrap_or("?").to_string();
            let pass_count = text.matches("→ PASS").count() as u32;
            let fail_count = text.matches("→ FAIL").count() as u32;
            reports.push(ProbeReport {
                file: name,
                time,
                variant: grab("变体:"),
                model: grab("模型:"),
                tiers: grab("挡位:"),
                asr,
                pass_count,
                fail_count,
            });
        }
    }
    // 弹药库统计(只读; ammo.rs 的库)
    let (mut ammo_count, mut ammo_verified) = (0u32, 0u32);
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    let db = std::path::PathBuf::from(format!("{home}\\.dsh\\ammo-knowledge.db"));
    if db.exists() {
        if let Ok(con) =
            rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        {
            let q = |sql: &str| -> u32 {
                con.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0) as u32
            };
            ammo_count = q("SELECT COUNT(*) FROM poc");
            ammo_verified = q("SELECT COALESCE(SUM(verified),0) FROM poc");
        }
    }
    Ok(ReportData {
        reports,
        ammo_count,
        ammo_verified,
    })
}

/// 战报生成: 汇聚最新报告+弹药库 → markdown 存到桌面
#[tauri::command]
pub async fn report_generate() -> Result<String, String> {
    let data = report_scan().await?;
    let mut md = String::from("# POJIA.AI 战报\n\n");
    md.push_str(&format!(
        "生成时间: {} | 弹药库: {} 条 ({} 已验证)\n\n",
        chrono_now(),
        data.ammo_count,
        data.ammo_verified
    ));
    md.push_str("## 探针战果\n\n| 报告 | 模型 | 变体 | 挡位 | ASR | PASS/FAIL |\n|---|---|---|---|---|---|\n");
    for r in &data.reports {
        md.push_str(&format!(
            "| {} | {} | {} | {} | {} | {}/{} |\n",
            r.file
                .trim_start_matches("probe_report_")
                .trim_end_matches(".md"),
            r.model,
            r.variant,
            r.tiers,
            r.asr,
            r.pass_count,
            r.fail_count
        ));
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    let out = std::path::PathBuf::from(format!("{home}\\Desktop\\pojia-战报-{}.md", stamp()));
    std::fs::write(&out, &md).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().into_owned())
}

fn chrono_now() -> String {
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-Date -Format 'yyyy-MM-dd HH:mm'",
        ])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn stamp() -> String {
    chrono_now()
        .replace('-', "")
        .replace(' ', "")
        .replace(':', "")
}
