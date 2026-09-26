// Probe 页 — 探针矩阵面板：点选 模型×挡位×组别×变体 → 后台跑 → ASR 进度实时回显
// 数据链：pojia-breaker/tools/probe.py（本机 spawn），凭证存 ~/.dsh/probe-config.json
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Topbar } from '@/components/topbar'
import { Play, RefreshCw, Settings, FolderOpen } from 'lucide-react'

type ProbeLine = {
  idx: number | null
  model: string | null
  effort: string | null
  probe: string | null
  verdict: string | null
  note: string
}
type ProbeRun = {
  id: string
  done: boolean
  exit_code: number | null
  lines: ProbeLine[]
  asr: number | null
  csv_path: string | null
  md_path: string | null
  error: string | null
}
type ProbeConfig = { base: string | null; key_set: boolean; breaker_dir: string | null; python: string | null }

const MODELS = ['deepseek-chat', 'deepseek-reasoner', 'glm-4-flash', 'gpt-4o-mini']
const EFFORTS = ['off', 'low', 'medium', 'high']
const VARIANTS = ['base', 'light', 'hybrid', 'full', 'poko', 'pokov2']
const GROUPS = [
  { g: 'A', label: 'A 口语' },
  { g: 'B', label: 'B 实验室措辞' },
  { g: 'C', label: 'C 同义技术描述' },
  { g: 'AB', label: 'AB 对照' },
]

const VERDICT_COLOR: Record<string, string> = {
  PASS: 'text-emerald-500',
  WARN: 'text-amber-500',
  FAIL: 'text-red-500',
  ERROR: 'text-black/40 dark:text-white/35',
}

export function Probe() {
  const [cfg, setCfg] = useState<ProbeConfig | null>(null)
  const [showCfg, setShowCfg] = useState(false)
  const [cfgBase, setCfgBase] = useState('')
  const [cfgKey, setCfgKey] = useState('')
  const [cfgDir, setCfgDir] = useState('')
  const [cfgPy, setCfgPy] = useState('')

  const [models, setModels] = useState<string[]>(['deepseek-chat'])
  const [efforts, setEfforts] = useState<string[]>(['high'])
  const [variant, setVariant] = useState('pokov2')
  const [group, setGroup] = useState('C')
  const [quick, setQuick] = useState(false)

  const [run, setRun] = useState<ProbeRun | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    invoke<ProbeConfig>('probe_config_get').then((c) => {
      setCfg(c)
      setCfgBase(c.base ?? '')
      setCfgDir(c.breaker_dir ?? '')
      setCfgPy(c.python ?? '')
    })
  }, [])

  // 轮询运行进度
  useEffect(() => {
    if (!run || run.done) return
    timer.current = window.setInterval(async () => {
      try {
        const r = await invoke<ProbeRun>('probe_status', { runId: run.id })
        setRun(r)
        if (r.done && timer.current) { clearInterval(timer.current); timer.current = null }
      } catch { /* run 可能刚结束被查 */ }
    }, 1200)
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  }, [run?.id, run?.done])

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const saveCfg = async () => {
    await invoke('probe_config_set', { base: cfgBase || null, key: cfgKey || null, breakerDir: cfgDir || null, python: cfgPy || null })
    const c = await invoke<ProbeConfig>('probe_config_get')
    setCfg(c); setShowCfg(false); setErr(null)
  }

  const start = async () => {
    setErr(null); setBusy(true)
    try {
      const r = await invoke<{ ok: boolean; run_id: string | null; error: string | null }>('probe_run', {
        models, efforts, variant, group, quick,
      })
      if (r.ok && r.run_id) {
        setRun({ id: r.run_id, done: false, exit_code: null, lines: [], asr: null, csv_path: null, md_path: null, error: null })
      } else {
        setErr(r.error ?? '启动失败')
      }
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  const openReports = async () => { await invoke('probe_open_reports') }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Topbar
        kicker="PROBE / 探针矩阵"
        title="探针矩阵"
        sub={`破甲消融评测：模型 × 挡位 × 组别（A 口语 / B 实验室 / C 同义技术描述）。${cfg?.key_set ? '凭证已配置 ✓' : '⚠ 未配置凭证'}`}
        actions={
          <>
            <button className="btn" onClick={() => setShowCfg(!showCfg)}><Settings size={14} />设置</button>
            <button className="btn" onClick={openReports}><FolderOpen size={14} />报告目录</button>
          </>
        }
      />

      {err && <div className="mb-3 text-[13px] text-red-600">{err}</div>}

      {showCfg && (
        <div className="mb-5 p-4 rounded-xl border border-black/10 dark:border-white/10 grid grid-cols-2 gap-3 text-[13px]">
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" placeholder="探针 base（如 https://api.xxx/v1）" value={cfgBase} onChange={(e) => setCfgBase(e.target.value)} />
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" type="password" placeholder={cfg?.key_set ? 'key 已设置（输入则覆盖）' : '探针 key'} value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} />
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" placeholder="pojia-breaker 目录（默认 ~/pojia-breaker）" value={cfgDir} onChange={(e) => setCfgDir(e.target.value)} />
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" placeholder="python 路径（默认 PATH 里的 python）" value={cfgPy} onChange={(e) => setCfgPy(e.target.value)} />
          <div><button className="btn btn-primary" onClick={saveCfg}>保存配置</button></div>
        </div>
      )}

      {/* 选择器 */}
      <div className="flex gap-5 mb-4 text-[13px] flex-wrap items-start">
        <div>
          <div className="text-black/45 dark:text-white/40 mb-1">模型（可多选）</div>
          <div className="flex gap-1 flex-wrap">
            {MODELS.map((m) => (
              <button key={m} onClick={() => toggle(models, m, setModels)}
                className={`px-3 py-1.5 rounded-full border ${models.includes(m) ? 'border-black/60 dark:border-white/70 bg-black/80 dark:bg-white/90 text-white dark:text-black' : 'border-black/15 dark:border-white/15'}`}>{m}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-black/45 dark:text-white/40 mb-1">挡位</div>
          <div className="flex gap-1">
            {EFFORTS.map((e) => (
              <button key={e} onClick={() => toggle(efforts, e, setEfforts)}
                className={`px-3 py-1.5 rounded-full border ${efforts.includes(e) ? 'border-black/60 dark:border-white/70 bg-black/80 dark:bg-white/90 text-white dark:text-black' : 'border-black/15 dark:border-white/15'}`}>{e}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-black/45 dark:text-white/40 mb-1">变体</div>
          <select className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5" value={variant} onChange={(e) => setVariant(e.target.value)}>
            {VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <div className="text-black/45 dark:text-white/40 mb-1">组别</div>
          <select className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5" value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUPS.map((x) => <option key={x.g} value={x.g}>{x.label}</option>)}
          </select>
        </div>
        <div className="self-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> quick 冒烟
          </label>
        </div>
        <div className="self-end pb-0.5">
          <button className="btn btn-primary" disabled={busy || !run || run.done ? false : true} onClick={start}>
            <Play size={14} />{run && !run.done ? '运行中…' : '开跑'}
          </button>
        </div>
      </div>

      {/* 进度区 */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 text-[13px]">
        {!run && <div className="text-black/40 dark:text-white/35 py-14 text-center">配置后点「开跑」— 每发探针的判定实时显示在这里</div>}
        {run && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-black/45 dark:text-white/40">{run.id}</span>
              {run.asr !== null && (
                <span className="text-[15px] font-semibold">总 ASR：{run.asr}%</span>
              )}
              <span className="ml-auto">
                {run.done
                  ? `完成（exit ${run.exit_code ?? '?'}）`
                  : <span className="flex items-center gap-1"><RefreshCw size={13} className="animate-spin" />运行中</span>}
              </span>
            </div>
            <pre className="font-mono text-[12px] leading-relaxed max-h-[420px] overflow-auto whitespace-pre-wrap">
              {run.lines.map((l, i) => {
                if (l.verdict) {
                  return <div key={i}><span className="text-black/40 dark:text-white/35">[{String(l.idx).padStart(3, ' ')}]</span> {l.model} {l.effort} {l.probe} <span className={VERDICT_COLOR[l.verdict] ?? ''}>{l.verdict}</span> {l.note}</div>
                }
                return <div key={i} className="text-black/60 dark:text-white/50">{l.note}</div>
              })}
            </pre>
            {run.done && run.csv_path && (
              <div className="mt-3 text-black/50 dark:text-white/40">明细：{run.csv_path}</div>
            )}
            {run.error && <div className="mt-2 text-red-600">{run.error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
