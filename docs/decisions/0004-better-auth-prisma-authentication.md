# 0004 使用 Better Auth 和 Prisma 实现多用户认证

## Status

Accepted

## Context

旧后台使用单个 `ADMIN_ACCESS_TOKEN` 和自签名 cookie，只能表达“是否是管理员”，无法支持注册、邮箱验证、密码重置、多用户角色、停用账号、撤销会话和审计日志。

项目需要更正式的账号体系，同时保留 Next.js App Router 和动态 API 的部署方式。

## Decision

使用 Better Auth 作为认证框架，使用 Prisma adapter 连接 PostgreSQL。启用邮箱密码登录、邮箱验证、密码重置和 admin 插件。用 `ADMIN_EMAILS` 在用户创建时自动分配初始管理员角色。

认证数据模型由 Prisma 管理，包括 `User`、`Session`、`Account`、`Verification` 和 `AdminAuditLog`。管理员 API 统一通过 `requireAdmin()` 校验 session 和 `admin` 角色，并对关键操作写入审计日志。

## Consequences

- 支持多用户、角色权限、邮箱验证和密码重置。
- 后台权限从单 token 改为数据库中的用户角色。
- 部署新增 PostgreSQL、Prisma migration 和 SMTP 依赖。
- 生产必须妥善配置 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、SMTP 变量和 `ADMIN_EMAILS`。
- 后续认证相关变更需要同步更新认证架构文档、运维文档和本 ADR 或新的 ADR。
