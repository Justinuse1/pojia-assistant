// ammo.rs — 弹药库/经验复用（移植自 dsh-redteam-mode 的 knowledge.db + poc 模型, MIT）
// 数据落 ~/.dsh/ammo-knowledge.db（跨靶标共享, 一个库全局复用）。
// 表结构: runner/theater_schema.sql 的 poc / poc_fts（本文件内嵌同一份 DDL 的子集）。
use rusqlite::Connection;
use serde::Serialize;
use std::path::PathBuf;
use tauri::command;

fn db_path() -> PathBuf {
    // 复用 DSH home（与 theater facts 同根, 便于将来合并）
    let home = std::env::var("DSH_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(".dsh")
        });
    home.join("ammo-knowledge.db")
}

fn open_db() -> Result<Connection, String> {
    let p = db_path();
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let conn = Connection::open(&p).map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS poc (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          kind TEXT,
          category TEXT,
          cve TEXT,
          component TEXT,
          versions TEXT,
          severity TEXT,
          language TEXT,
          source TEXT,
          source_url TEXT,
          description TEXT,
          usage TEXT,
          content TEXT,
          path TEXT,
          verified INTEGER DEFAULT 0,
          verified_note TEXT,
          hit_count INTEGER DEFAULT 0,
          used_on TEXT,
          engagement_id TEXT,
          engagement_name TEXT,
          asset_target TEXT,
          found_by_agent TEXT,
          tags TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT,
          UNIQUE(code)
        );
        CREATE INDEX IF NOT EXISTS ix_poc_cve ON poc(cve);
        CREATE INDEX IF NOT EXISTS ix_poc_component ON poc(component);
        CREATE INDEX IF NOT EXISTS ix_poc_kind ON poc(kind, verified);
        CREATE VIRTUAL TABLE IF NOT EXISTS poc_fts USING fts5(
          poc_id UNINDEXED, title, cve, component, versions, tags, description, content
        );
        "#,
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

#[derive(Serialize)]
pub struct AmmoItem {
    pub id: i64,
    pub code: String,
    pub title: String,
    pub kind: Option<String>,
    pub category: Option<String>,
    pub cve: Option<String>,
    pub component: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub usage: Option<String>,
    pub content: Option<String>,
    pub verified: bool,
    pub verified_note: Option<String>,
    pub hit_count: i64,
    pub used_on: Option<String>,
    pub engagement_name: Option<String>,
    pub asset_target: Option<String>,
    pub found_by_agent: Option<String>,
    pub tags: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize)]
pub struct AmmoList {
    pub ok: bool,
    pub items: Vec<AmmoItem>,
    pub total: i64,
}

#[derive(Serialize)]
pub struct AmmoOp {
    pub ok: bool,
    pub id: Option<i64>,
    pub message: String,
}

fn row_to_item(r: &rusqlite::Row) -> rusqlite::Result<AmmoItem> {
    Ok(AmmoItem {
        id: r.get(0)?,
        code: r.get(1)?,
        title: r.get(2)?,
        kind: r.get(3)?,
        category: r.get(4)?,
        cve: r.get(5)?,
        component: r.get(6)?,
        language: r.get(7)?,
        description: r.get(8)?,
        usage: r.get(9)?,
        content: r.get(10)?,
        verified: r.get::<_, i64>(11)? != 0,
        verified_note: r.get(12)?,
        hit_count: r.get(13)?,
        used_on: r.get(14)?,
        engagement_name: r.get(15)?,
        asset_target: r.get(16)?,
        found_by_agent: r.get(17)?,
        tags: r.get(18)?,
        created_at: r.get(19)?,
    })
}

const ITEM_COLS: &str =
    "id, code, title, kind, category, cve, component, language, description, usage, content, \
     verified, verified_note, hit_count, used_on, engagement_name, asset_target, found_by_agent, tags, created_at";

/// 检索弹药（q=全文词, category/kind/verified 过滤, 与上游 KnowledgeTab 同构）
#[command]
pub fn ammo_list(
    q: Option<String>,
    category: Option<String>,
    kind: Option<String>,
    verified_only: Option<bool>,
    limit: Option<i64>,
) -> Result<AmmoList, String> {
    let conn = open_db()?;
    let mut sql = format!("SELECT {ITEM_COLS} FROM poc WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(v) = verified_only {
        if v {
            sql.push_str(" AND verified=1");
        }
    }
    if let Some(v) = &category {
        if !v.is_empty() {
            sql.push_str(&format!(" AND category={}", params.len() + 1));
            params.push(Box::new(v.clone()));
        }
    }
    if let Some(v) = &kind {
        if !v.is_empty() {
            sql.push_str(&format!(" AND kind={}", params.len() + 1));
            params.push(Box::new(v.clone()));
        }
    }
    if let Some(v) = &q {
        if !v.trim().is_empty() {
            sql.push_str(&format!(
                " AND id IN (SELECT poc_id FROM poc_fts WHERE poc_fts MATCH {})",
                params.len() + 1
            ));
            params.push(Box::new(v.trim().to_string()));
        }
    }
    sql.push_str(" ORDER BY hit_count DESC, updated_at DESC");
    sql.push_str(&format!(" LIMIT {}", limit.unwrap_or(200).clamp(1, 1000)));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let items = stmt
        .query_map(refs.as_slice(), row_to_item)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let total = items.len() as i64;
    Ok(AmmoList { ok: true, items, total })
}

/// 新增/更新弹药（code 相同则 upsert）
#[allow(clippy::too_many_arguments)]
#[command]
pub fn ammo_save(
    code: String,
    title: String,
    kind: Option<String>,
    category: Option<String>,
    cve: Option<String>,
    component: Option<String>,
    language: Option<String>,
    description: Option<String>,
    usage: Option<String>,
    content: Option<String>,
    tags: Option<String>,
) -> Result<AmmoOp, String> {
    let conn = open_db()?;
    let now = chrono_now();
    conn.execute(
        r#"INSERT INTO poc(code, title, kind, category, cve, component, language,
             description, usage, content, tags, created_by, created_at, updated_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'pojia-assistant',?12,?12)
           ON CONFLICT(code) DO UPDATE SET
             title=excluded.title, kind=excluded.kind, category=excluded.category,
             cve=excluded.cve, component=excluded.component, language=excluded.language,
             description=excluded.description, usage=excluded.usage, content=excluded.content,
             tags=excluded.tags, updated_at=excluded.updated_at"#,
        rusqlite::params![code, title, kind, category, cve, component, language,
                          description, usage, content, tags, now],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    // 同步 FTS
    let _ = conn.execute(
        "DELETE FROM poc_fts WHERE poc_id=(SELECT id FROM poc WHERE code=?1)",
        rusqlite::params![code],
    );
    let _ = conn.execute(
        "INSERT INTO poc_fts(poc_id, title, cve, component, versions, tags, description, content)
         SELECT id, title, cve, component, versions, tags, description, content FROM poc WHERE code=?1",
        rusqlite::params![code],
    );
    Ok(AmmoOp { ok: true, id: Some(id), message: "saved".into() })
}

/// 复用计数：每次实际使用 +1 并记 used_on（经验复用的核心闭环）
#[command]
pub fn ammo_use(code: String, used_on: String) -> Result<AmmoOp, String> {
    let conn = open_db()?;
    let n = conn
        .execute(
            "UPDATE poc SET hit_count=hit_count+1, used_on=?2, updated_at=?3 WHERE code=?1",
            rusqlite::params![code, used_on, chrono_now()],
        )
        .map_err(|e| e.to_string())?;
    Ok(AmmoOp {
        ok: n > 0,
        id: None,
        message: if n > 0 { "counted".into() } else { "no such code".into() },
    })
}

/// 标记验证状态（实测过才算真金白银的经验）
#[command]
pub fn ammo_verify(code: String, verified: bool, note: Option<String>) -> Result<AmmoOp, String> {
    let conn = open_db()?;
    let n = conn
        .execute(
            "UPDATE poc SET verified=?2, verified_note=?3, updated_at=?4 WHERE code=?1",
            rusqlite::params![code, verified as i64, note, chrono_now()],
        )
        .map_err(|e| e.to_string())?;
    Ok(AmmoOp { ok: n > 0, id: None, message: "verified".into() })
}

/// 删除弹药
#[command]
pub fn ammo_delete(code: String) -> Result<AmmoOp, String> {
    let conn = open_db()?;
    conn.execute("DELETE FROM poc WHERE code=?1", rusqlite::params![code])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "DELETE FROM poc_fts WHERE poc_id NOT IN (SELECT id FROM poc)",
        [],
    );
    Ok(AmmoOp { ok: true, id: None, message: "deleted".into() })
}

fn chrono_now() -> String {
    // 无 chrono 依赖：用系统秒数格式化不了 ISO, 退而求其次存 unix 秒（排序不受影响）
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("@{secs}")
}
