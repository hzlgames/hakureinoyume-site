# 认证架构

## 概览

当前认证系统使用 Better Auth、Prisma adapter 和 PostgreSQL。旧的 `ADMIN_ACCESS_TOKEN` 单管理员登录接口已经移除，后台权限改为正式账号系统中的 `admin` 角色。

## 核心文件

- `src/lib/auth.ts`：Better Auth 服务端配置。
- `src/lib/auth-client.ts`：浏览器端 auth client，导出 `signIn`、`signOut`、`signUp`、`useSession`。
- `src/lib/admin.ts`：服务端读取 session，提供 `requireAdmin()` 和审计日志写入。
- `src/lib/email.ts`：SMTP 邮件发送。
- `src/lib/prisma.ts`：Prisma client。
- `src/app/api/auth/[...all]/route.ts`：Better Auth API handler。
- `src/app/api/admin/users/**`：管理员用户管理 API。
- `prisma/schema.prisma`：认证和审计数据模型。

## 用户与角色

用户注册使用邮箱和密码。邮箱在创建前会被 trim 并转小写。注册后要求邮箱验证；登录时也会触发验证邮件发送逻辑。

角色字段存储在 `User.role`：

- `user`：默认角色。
- `admin`：可访问 `/admin` 并调用管理员 API。

`ADMIN_EMAILS` 是逗号分隔的邮箱列表。新用户创建时，如果邮箱命中该列表，则初始角色设为 `admin`，否则为 `user`。

## 数据模型

Prisma schema 定义：

- `User`：用户资料、邮箱验证状态、角色、停用状态。
- `Session`：登录会话，关联用户。
- `Account`：认证账号和密码凭据。
- `Verification`：邮箱验证和密码重置相关 token。
- `AdminAuditLog`：管理员操作审计。

生成的 Prisma client 存放在 `src/generated/prisma/`。这些文件是生成产物，通常不要手工编辑。

## 登录与密码流程

- `/register`：创建账号，成功后提示用户查收验证邮件。
- `/login`：邮箱密码登录；未验证时可重发验证邮件。
- `/forgot-password`：请求密码重置邮件。
- `/reset-password`：使用 Better Auth token 设置新密码。
- 密码重置后会撤销已有会话。

邮件通过 SMTP 发送，配置来自 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS` 和 `AUTH_EMAIL_FROM`。

## 管理员权限

所有管理员 API 调用 `requireAdmin()`：

1. 读取 Better Auth session。
2. 未登录返回 `401 unauthenticated`。
3. 非 `admin` 角色返回 `403 forbidden`。
4. 通过后返回当前 session。

管理员可执行：

- 查询用户和最近审计日志。
- 修改用户角色。
- 停用或恢复用户；停用时撤销该用户会话。
- 撤销用户全部会话。
- 为用户设置新密码。
- 更新或重置站点背景。

会改变后台状态的操作应写入 `AdminAuditLog`。

## 维护注意事项

- 改认证流程时同步更新本文件、运维文档和 ADR。
- 改 Prisma schema 后必须新增迁移，并确认生成客户端与 schema 对齐。
- 新增管理员能力时必须复用 `requireAdmin()`，并考虑是否需要审计日志。
- 不要重新引入 `ADMIN_ACCESS_TOKEN` 单 token 后门，除非先新增 ADR 说明原因、范围和风险。
