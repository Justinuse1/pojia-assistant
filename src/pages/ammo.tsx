// Ammo 页 — 弹药库/经验复用（POKO 变体·探针弹药·跨靶标复用统计）
// 交互对齐 dsh-redteam-mode KnowledgeTab: 检索 + verified/category/kind 过滤 + 复用计数
import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Topbar } from '@/components/topbar'
import { Crosshair, RefreshCw, Plus, CheckCircle2, Trash2, Flame } from 'lucide-react'

type AmmoItem = {
  id: number
  code: string
  title: string
  kind: string | null
  category: string | null
  cve: string | null
  component: string | null
  language: string | null
  description: string | null
  usage: string | null
  content: string | null
  verified: boolean
  verified_note: string | null
  hit_count: number
  used_on: string | null
  engagement_name: string | null
  asset_target: string | null
  found_by_agent: string | null
  tags: string | null
  created_at: string | null
}

const CATEGORIES = [
  '', 'jailbreak-persona', 'word-anchor-bypass', 'context-priming', 'role-confusion',
  'payload-template', 'rce', 'sqli', 'unauthorized', 'auth-bypass', 'weak-password',
  'file-read', 'info-leak', 'privesc', 'tunnel', 'other',
]

export function Ammo() {
  const [items, setItems] = useState<AmmoItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [kind, setKind] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [detail, setDetail] = useState<AmmoItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ code: '', title: '', category: '', kind: 'payload', content: '', usage: '', tags: '' })

  const query = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await invoke<{ ok: boolean; items: AmmoItem[] }>('ammo_list', {
        q: q.trim() || null, category: category || null, kind: kind || null,
        verifiedOnly, limit: 300,
      })
      setItems(r.items)
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  useEffect(() => { query() }, []) // 首屏拉全量, 检索显式触发

  const open = async (it: AmmoItem) => {
    setOpenCode(it.code); setDetail(it)
  }

  const markUsed = async (code: string) => {
    try {
      await invoke('ammo_use', { code, usedOn: `@${Math.floor(Date.now() / 1000)}` })
      setMsg(`已记复用：${code}`)
      query()
    } catch (e) { setErr(String(e)) }
  }

  const markVerified = async (code: string) => {
    try {
      await invoke('ammo_verify', { code, verified: true, note: '界面标记' })
      setMsg(`已标记验证：${code}`)
      if (openCode === code && detail) setDetail({ ...detail, verified: true })
      query()
    } catch (e) { setErr(String(e)) }
  }

  const remove = async (code: string) => {
    try {
      await invoke('ammo_delete', { code })
      setMsg(`已删除：${code}`)
      if (openCode === code) { setOpenCode(null); setDetail(null) }
      query()
    } catch (e) { setErr(String(e)) }
  }

  const save = async () => {
    if (!draft.code.trim() || !draft.title.trim()) { setErr('code 和 title 必填'); return }
    try {
      await invoke('ammo_save', {
        code: draft.code.trim(), title: draft.title.trim(),
        kind: draft.kind || null, category: draft.category || null,
        cve: null, component: null, language: null,
        description: null, usage: draft.usage || null,
        content: draft.content || null, tags: draft.tags || null,
      })
      setMsg(`已保存：${draft.code}`)
      setAdding(false)
      setDraft({ code: '', title: '', category: '', kind: 'payload', content: '', usage: '', tags: '' })
      query()
    } catch (e) { setErr(String(e)) }
  }

  const stats = useMemo(() => {
    const all = items ?? []
    return {
      total: all.length,
      verified: all.filter((x) => x.verified).length,
      reused: all.filter((x) => x.hit_count > 0).length,
      hits: all.reduce((s, x) => s + x.hit_count, 0),
    }
  }, [items])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Topbar
        kicker="AMMO / 弹药库"
        title="弹药库（经验复用）"
        sub={`共 ${stats.total} 条 · 已验证 ${stats.verified} · 复用过 ${stats.reused} · 累计复用 ${stats.hits} 次`}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setAdding(!adding)}><Plus size={14} />{adding ? '收起' : '新增弹药'}</button>
            <button className="btn" onClick={query}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />刷新</button>
          </>
        }
      />

      {msg && <div className="mb-3 text-[13px] text-emerald-600">{msg}</div>}
      {err && <div className="mb-3 text-[13px] text-red-600">{err}</div>}

      {adding && (
        <div className="mb-5 p-4 rounded-xl border border-black/10 dark:border-white/10 grid grid-cols-2 gap-3 text-[13px]">
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" placeholder="code（稳定 slug，如 poko-v2）" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" placeholder="标题" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <select className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c || '(分类)'}</option>)}
          </select>
          <select className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            {['payload', 'poc', 'exp', 'script', 'template'].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 col-span-2" placeholder="tags（逗号分隔）" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
          <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 col-span-2" placeholder="用法/命令行示例" value={draft.usage} onChange={(e) => setDraft({ ...draft, usage: e.target.value })} />
          <textarea className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 col-span-2 font-mono" rows={6} placeholder="正文（人设/速查表/脚本）" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
          <div><button className="btn btn-primary" onClick={save}>保存</button></div>
        </div>
      )}

      <div className="flex gap-2 mb-4 text-[13px] flex-wrap">
        <input className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 w-72" placeholder="全文检索（FTS5）…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && query()} />
        <select className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || '(全部分类)'}</option>)}
        </select>
        <select className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">(全部类型)</option>
          {['payload', 'poc', 'exp', 'script', 'template'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <label className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} /> 仅已验证
        </label>
        <button className="btn" onClick={query}>检索</button>
      </div>

      <div className="grid grid-cols-[1fr_1.2fr] gap-4">
        <div className="rounded-xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {(items ?? []).map((it) => (
            <div key={it.code}
              className={`px-4 py-3 cursor-pointer text-[13px] hover:bg-black/[.03] dark:hover:bg-white/[.03] ${openCode === it.code ? 'bg-black/[.04] dark:bg-white/[.04]' : ''}`}
              onClick={() => open(it)}>
              <div className="flex items-center gap-2">
                {it.verified && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                <span className="font-medium truncate">{it.title}</span>
                <span className="ml-auto shrink-0 flex items-center gap-1 text-amber-600"><Flame size={13} />{it.hit_count}</span>
              </div>
              <div className="text-black/45 dark:text-white/40 mt-0.5 flex gap-2 flex-wrap">
                <span className="font-mono">{it.code}</span>
                {it.category && <span>· {it.category}</span>}
                {it.kind && <span>· {it.kind}</span>}
                {it.used_on && <span>· 最近 {it.used_on}</span>}
              </div>
            </div>
          ))}
          {items && items.length === 0 && (
            <div className="px-4 py-10 text-center text-black/40 dark:text-white/35 text-[13px]">暂无弹药 — 点「新增弹药」入库</div>
          )}
        </div>

        <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 text-[13px] min-h-[300px]">
          {!detail && <div className="text-black/40 dark:text-white/35 py-16 text-center">选择左侧弹药查看详情</div>}
          {detail && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{detail.title}</span>
                <span className="font-mono text-black/45 dark:text-white/40">{detail.code}</span>
                {detail.verified
                  ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} />已验证</span>
                  : <button className="text-blue-600 underline" onClick={() => markVerified(detail.code)}>标记已验证</button>}
                <span className="ml-auto" />
                <button className="text-amber-600 underline flex items-center gap-1" onClick={() => markUsed(detail.code)}><Crosshair size={13} />记一次复用</button>
                <button className="text-red-500 underline flex items-center gap-1" onClick={() => remove(detail.code)}><Trash2 size={13} />删除</button>
              </div>
              <div className="text-black/50 dark:text-white/40 grid grid-cols-2 gap-1">
                <div>分类：{detail.category ?? '—'}</div>
                <div>类型：{detail.kind ?? '—'}</div>
                <div>复用次数：{detail.hit_count}</div>
                <div>最近用于：{detail.used_on ?? '—'}</div>
                <div>来源靶标：{detail.engagement_name ?? '—'}</div>
                <div>发现资产：{detail.asset_target ?? '—'}</div>
                <div>发现者：{detail.found_by_agent ?? '—'}</div>
                <div>tags：{detail.tags ?? '—'}</div>
              </div>
              {detail.usage && (
                <div>
                  <div className="text-black/45 dark:text-white/40 mb-1">用法</div>
                  <pre className="p-3 rounded-lg bg-black/5 dark:bg-white/5 whitespace-pre-wrap font-mono text-[12px]">{detail.usage}</pre>
                </div>
              )}
              {detail.content && (
                <div>
                  <div className="text-black/45 dark:text-white/40 mb-1">正文</div>
                  <pre className="p-3 rounded-lg bg-black/5 dark:bg-white/5 whitespace-pre-wrap font-mono text-[12px] max-h-[360px] overflow-auto">{detail.content}</pre>
                </div>
              )}
              {detail.verified_note && <div className="text-black/45 dark:text-white/40">验证证据：{detail.verified_note}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
