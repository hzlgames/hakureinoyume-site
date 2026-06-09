# 0003 使用仓库内文档与维护 skill 管理 agent 知识

## Status

Accepted

## Context

项目后续主要由 agent 维护。仅靠 README 容易遗漏架构、功能、部署和决策背景；每次改代码都强制更新文档又会增加噪音。

## Decision

采用轻量 docs-as-code 文档体系，把项目事实保存在仓库 `docs/` 中。新增仓库内 skill `skills/hakureinoyume-maintenance/`，用于在 Git 远端同步前或用户明确提醒时检查知识库是否需要更新。

## Consequences

- 文档和代码同版本演进，agent 可以先读文档再核对源码。
- 远端同步前形成知识维护门禁，降低文档漂移。
- 普通本地试验不强制触发文档更新，减少维护成本。
- 若要让 Codex 自动发现该 skill，需要把仓库内 skill 同步或安装到 `${CODEX_HOME:-$HOME/.codex}/skills`。
