# POJIA Assistant ⚡

**POJIA.AI 的 Agent 客户端管理助手** — 提示词 × 技能库 × 客户端自由搭配，外加安全评测全套面板。

> 衍生作品声明：本项目基于 [Alice 助手 (alice-assistant)](https://github.com/alicewe1/alice-assistant)
> （Copyright (C) 2026 alicewe1, GPL-3.0-or-later）衍生，依同一协议分发，修改声明见 [NOTICE](NOTICE)。

## 在 Alice 基础上的 POJIA 增量

| 模块 | 说明 | 状态 |
|---|---|---|
| 探针矩阵面板 | 模型×挡位×A/B/C 措辞消融，ASR 矩阵可视化 | 🚧 规划中 |
| 战果引擎面板 | 战果模板登记/fork/战区时间线 | 🚧 规划中 |
| 弹药库管理 | POKO 等载荷变体+激活词+速查表管理 | 🚧 规划中 |
| 中转端点配置 | 评测用中转/key 管理（仅存本地） | 🚧 规划中 |

继承自 Alice 的全部能力（提示词/技能库管理、多客户端注入、便携运行时、云过审）见原版文档。

## 构建

同上游：`pnpm install` → `pnpm run release`（需 MSVC 工具链）。

## License

GPL-3.0-or-later（同上游），详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。
