// board.tsx 全量替换版 — 项目看板: agent 工况 + 版本路线 + 实时日志 + 战果摘要
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Agent = { name: string; role: string; status: string; task: string; progress: number; updated: string }
type Board = {
  project: string; version: string; updated: string
  agents: Agent[]
  roadmap: { ver: string; name: string; status: string }[]
  log: { time: string; who: string; what: string }[]
}
type ProbeReport = { file: string; time: string; variant: string; model: string; tiers: string; asr: string; pass_count: number; fail_count: number }
type ReportData = { reports: ProbeReport[]; ammo_count: number; ammo_verified: number }

const STATUS: Record<string, { label: string; color: string }> = {
  running: { label: '🟢 干活中', color: '#4ade80' },
  idle: { label: '⚪ 空闲', color: '#888' },
  done: { label: '✅ 完成', color: '#4ade80' },
  blocked: { label: '⛔ 受阻', color: '#f87171' },
}

export function BoardPage() {
  const [board, setBoard] = useState<Board | null>(null)
  const [rep, setRep] = useState<ReportData | null>(null)
  const [err, setErr] = useState('')
  const [out, setOut] = useState('')

  const load = async () => {
    try {
      const raw = await invoke<any>('board_read')
      setBoard(typeof raw === 'string' ? JSON.parse(raw) : raw)
      setErr('')
    } catch (e) { setErr(String(e)) }
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const genReport = async () => {
    try {
      const p = await invoke<string>('report_generate')
      setOut(`已生成: ${p}`)
    } catch (e) { setOut(`失败: ${e}`) }
  }
  useEffect(() => { invoke<ReportData>('report_scan').then(setRep).catch(() => {}) }, [])

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

      {/* 战果摘要 */}
      {rep && rep.reports.length > 0 && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2>战果摘要 <span className="muted" style={{ fontSize: 13 }}>弹药库 {rep.ammo_count} 条 ({rep.ammo_verified} 已验证)</span></h2>
          {rep.reports.slice(0, 8).map(r => (
            <div key={r.file} style={{ padding: '6px 0', fontSize: 13, display: 'flex', gap: 10, borderBottom: '1px solid rgba(128,128,128,.1)' }}>
              <span className="muted" style={{ minWidth: 130 }}>{r.time}</span>
              <b style={{ minWidth: 150 }}>{r.model}</b>
              <span style={{ minWidth: 80 }}>{r.variant}</span>
              <span className="muted" style={{ minWidth: 60 }}>{r.tiers}</span>
              <span style={{ minWidth: 60, color: r.asr.includes('0%') ? '#f87171' : '#4ade80' }}>ASR {r.asr}</span>
              <span className="muted">PASS {r.pass_count} / FAIL {r.fail_count}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={genReport}>生成战报 → 桌面</button>
            {out && <span className="muted" style={{ fontSize: 12 }}>{out}</span>}
          </div>
        </section>
      )}

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
