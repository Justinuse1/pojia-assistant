// Board 页 — 项目进度看板：agent 工况 + 版本路线 + 实时日志
// 数据源: 项目根 board.json (agent 干活时热更新), 前端 5s 轮询
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Agent = { name: string; role: string; status: string; task: string; progress: number; updated: string }
type Board = {
  project: string; version: string; updated: string
  agents: Agent[]
  roadmap: { ver: string; name: string; status: string }[]
  log: { time: string; who: string; what: string }[]
}

const STATUS: Record<string, { label: string; color: string }> = {
  running: { label: '🟢 干活中', color: 'var(--acc, #4ade80)' },
  idle: { label: '⚪ 空闲', color: 'var(--mut, #888)' },
  done: { label: '✅ 完成', color: '#4ade80' },
  blocked: { label: '⛔ 受阻', color: '#f87171' },
}

export function BoardPage() {
  const [board, setBoard] = useState<Board | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const raw = await invoke<string>('board_read')
      setBoard(JSON.parse(raw))
      setErr('')
    } catch (e) { setErr(String(e)) }
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  if (err) return <div className="page"><div className="muted">看板加载失败: {err}</div></div>
  if (!board) return <div className="page"><div className="muted">加载中…</div></div>

  return (
    <div className="page">
      <div className="topbar">
        <h1>项目看板</h1>
        <div className="muted">{board.project} · v{board.version} · 更新于 {board.updated.slice(11, 16)}</div>
      </div>

      {/* Agent 工况 */}
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Agent 工况</h2>
        {board.agents.map(a => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(128,128,128,.15)' }}>
            <b style={{ minWidth: 90 }}>{a.name}</b>
            <span className="muted" style={{ minWidth: 180 }}>{a.role}</span>
            <span style={{ color: STATUS[a.status]?.color }}>{STATUS[a.status]?.label ?? a.status}</span>
            <div style={{ flex: 1, height: 6, background: 'rgba(128,128,128,.2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${a.progress}%`, height: '100%', background: STATUS[a.status]?.color ?? '#888', transition: 'width .4s' }} />
            </div>
            <span className="muted" style={{ minWidth: 40, textAlign: 'right' }}>{a.progress}%</span>
            <span className="muted" style={{ flex: 2, fontSize: 12 }}>{a.task}</span>
          </div>
        ))}
      </section>

      {/* 版本路线 */}
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>版本路线</h2>
        {board.roadmap.map(r => (
          <div key={r.ver} style={{ padding: '6px 0', display: 'flex', gap: 10 }}>
            <b style={{ minWidth: 48 }}>{r.ver}</b>
            <span>{r.status === 'done' ? '✅' : r.status === 'next' ? '▶' : '·'} {r.name}</span>
          </div>
        ))}
      </section>

      {/* 实时日志 */}
      <section className="card">
        <h2>干活日志</h2>
        {board.log.slice(0, 30).map((l, i) => (
          <div key={i} style={{ padding: '4px 0', fontSize: 13 }}>
            <span className="muted">{l.time}</span> <b>[{l.who}]</b> {l.what}
          </div>
        ))}
      </section>
    </div>
  )
}
