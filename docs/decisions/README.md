# 架构决策记录

ADR 用于记录长期技术选择及其原因。不要为每个小改动写 ADR；当变更会影响架构边界、部署方式、数据存储、安全模型、公共 API 或长期维护策略时再写。

## 当前记录

- [0001 使用 Next.js 动态服务承载后台能力](0001-next-dynamic-runtime.md)
- [0002 使用文件系统保存后台背景图](0002-file-backed-admin-background.md)
- [0003 使用仓库内文档与维护 skill 管理 agent 知识](0003-repository-knowledge-skill.md)
- [0004 使用 Better Auth 和 Prisma 实现多用户认证](0004-better-auth-prisma-authentication.md)

## 模板

新 ADR 使用递增编号，文件名格式为 `NNNN-short-title.md`。

```md
# NNNN 标题

## Status

Accepted | Superseded | Proposed

## Context

背景、约束和问题。

## Decision

做出的选择。

## Consequences

收益、代价和后续注意事项。
```
