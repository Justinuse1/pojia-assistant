# POJIA.AI 客户端 — 多代理开发编排（0926 定稿）

## 分工（本地 agent 流水线）

每个 agent 一个职能，主会话（玄烨）总控验收 + push 权。agent 只在本地分支/工作区干活，不直接 push。

| Agent | 职能 | 输入 | 产出 |
|---|---|---|---|
| **port-agent**（移植工） | 1:1 复刻上游功能。对着 alice-assistant 源码抄，最小 diff 进独立文件 | 上游 commit hash + 模块清单 | 可编译的模块代码 |
| **fuse-agent**（融合工） | 把我们已有成果叠加进去：云过审 REWRITES 融合、弹药库/探针矩阵接线、POJIA 品牌 | port-agent 产出 + pojia-breaker 资产 | 融合后的完整功能 |
| **test-agent**（测试工） | tsc --noEmit → vite build → cargo check → 冒烟（exe 起、页面可进、命令可调） | 代码分支 | 通过/失败报告 + 修复建议 |
| **rel-agent**（发布工） | 版本号、CHANGELOG、打 tag、GitHub Release 构建（tauri-action）、桌面 zip 交付 | test 通过的 main | Release 产物 |
| **sync-agent**（跟踪工） | 每日 `git fetch upstream`：有新 commit → 出「上游更新摘要 + 冲突预判」报告等主会话决定是否 merge | upstream repo | 更新报告 |

## 上游跟踪机制（已就位）

- 本地 `C:\Users\53241\alice-assistant` 已配 origin，`git fetch` 可用
- 当前上游领先 1 commit：`a4f68e9`（runtime.rs 51 行改动 + Cargo.toml）——**待 merge**
- 规则：我们的改动尽量放独立文件（probe/ammo/engine 页），上游文件最小 diff → merge 冲突面最小
- 每次上游更新先由 sync-agent 出报告，主会话过目再合，不合盲跟

## 版本路线（沿 REUSE-PLAN.md）

- **v5.1（当前）**：merge 上游 a4f68e9 → 全功能对齐
- **v5.2**：上游 REWRITES 表融合我们 C 组同义映射（外置 rules_extra.json，防杀软明文）
- **v5.3**：战果引擎面板（theater 时间线）+ 战报生成器
- **v6**：多中转负载测速 + GitHub Actions 自动构建

## 铁律（沿 0926 已有约定）

1. GPL-3.0 合规不动摇：LICENSE/NOTICE/upstream remote 永远在
2. 敏感词永不进二进制：弹药/规则全部外置 JSON 运行期加载
3. 靶名/域名/凭证不入库，push 前敏感扫描
4. 每个 agent 产出自验（tsc+cargo check 绿）才交，主会话终验后 push
5. agent 超时 600s 不够的任务拆小块，宁小勿断
