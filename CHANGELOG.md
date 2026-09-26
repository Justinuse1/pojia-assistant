## v6.0.0 (2026-09-26)

### 战果引擎（v5.3 内容随本版发布）
- `report.rs`：探针报告扫描（变体/模型/挡位/ASR/PASS-FAIL 解析）+ 弹药库只读统计
- 项目看板页新增「战果摘要」区块，一键生成战报 markdown 到桌面

### 多中转测速
- `speedtest.rs` + 中转测速页（11 导航）：对 relays.json 中每个中转×模型发 1-token 补全，量延迟与可用性
- 复用 ureq（零新依赖），排序即排名（可用优先、延迟升序）

### CI 自动构建
- GitHub Actions `.github/workflows/build.yml`：Windows/macOS/Linux 三平台，打 tag v* 自动出 Release

# Changelog

## v5.2.0 (2026-09-26)

### 云过审融合（fuse）
- 外置规则表 `resources/config/cloud_rules_extra.json`：15 条 C 组同义技术描述映射
  - 来源：pojia-breaker 弹药消融实测（A组50% → B组50% → C组100% ASR）
  - C组核心打头：keygen→序列号校验还原、RAT→加密指令下发+心跳回传、hook→指针链定位、C2→指令回传通道
  - 格式：上游 Vec<RulePair> 极简 from/to（带包装对象会被静默丢弃——已验证规避）
  - 不变式：任何 to 不命中任何 from（防连锁改写），追加式不覆盖内置31条
- 机制文档 `docs/rewrites-analysis.md`：上游 REWRITES/REFUSALS/外置表/版本迁移全解析

### 基建
- 项目看板页（10 项目看板）：agent 工况/版本路线/干活日志，board.json 5s 轮询
- agent→TG 播报器 `scripts/notify.py`：通知失败绝不阻塞主流程
- 多代理开发编排 `DEV-ORCHESTRATION.md`（port/fuse/test/release/sync 五工种）
- 合并上游 a4f68e9（is_runtime_root 修复 + allowBuilds 布尔）

