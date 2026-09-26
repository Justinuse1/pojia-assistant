// board.rs — 项目看板数据：读项目根 board.json 给前端轮询
use serde::Serialize;

#[derive(Serialize)]
pub struct BoardRaw {
    pub json: String,
    pub path: String,
}

fn board_path() -> std::path::PathBuf {
    // board.json 在仓库根（exe 的上级），开发期直接相对定位
    let mut p = std::env::current_dir().unwrap_or_default();
    let cand = p.join("board.json");
    if cand.exists() {
        return cand;
    }
    // 打包后 exe 在 src-tauri/target/release/ 下，向上找
    for _ in 0..6 {
        p = match p.parent() {
            Some(x) => x.to_path_buf(),
            None => break,
        };
        let c = p.join("board.json");
        if c.exists() {
            return c;
        }
    }
    std::env::current_dir()
        .unwrap_or_default()
        .join("board.json")
}

#[tauri::command]
pub async fn board_read() -> Result<BoardRaw, String> {
    let p = board_path();
    match std::fs::read_to_string(&p) {
        Ok(json) => Ok(BoardRaw {
            json,
            path: p.to_string_lossy().into_owned(),
        }),
        Err(e) => Err(format!("{}: {}", p.display(), e)),
    }
}
