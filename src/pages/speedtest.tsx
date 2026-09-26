// speedtest.tsx — 多中转测速页: 中转×模型 延迟/可用性矩阵
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type RelayResult = { name: string; base: string; model: string; ok: boolean; latency_ms: number; error: string }

export function Speedtest() {
  const [rows, setRows] = useState<RelayResult[]>([])
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const r = await invoke<RelayResult[]>('speedtest_run')
      setRows(r.sort((a, b) => (a.ok === b.ok ? a.latency_ms - b.latency_ms : a.ok ? -1 : 1)))
    } catch (e) { alert(String(e)) }
    setBusy(false)
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>中转测速</h1>
        <div className="muted">对 relays.json 里每个中转×模型发 1-token 补全, 量延迟与可用性</div>
      </div>
      <section className="card">
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-primary" onClick={run} disabled={busy}>
            {busy ? '测速中…' : '开始测速'}
          </button>
        </div>
        {rows.length > 0 && (
          <div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,.12)', fontSize: 13 }}>
                <span style={{ minWidth: 20 }}>{r.ok ? '🟢' : '🔴'}</span>
                <b style={{ minWidth: 110 }}>{r.name}</b>
                <span style={{ minWidth: 180 }}>{r.model}</span>
                <span style={{ minWidth: 90, color: r.ok ? (r.latency_ms < 3000 ? '#4ade80' : '#fbbf24') : '#f87171' }}>
                  {r.ok ? `${(r.latency_ms / 1000).toFixed(2)}s` : '不可用'}
                </span>
                <span className="muted" style={{ flex: 1 }}>{r.error}</span>
              </div>
            ))}
          </div>
        )}
        {!busy && rows.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>尚无结果。配置文件: src-tauri/relays.json</div>
        )}
      </section>
    </div>
  )
}
