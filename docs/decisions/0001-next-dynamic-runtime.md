# 0001 使用 Next.js 动态服务承载后台能力

## Status

Accepted

## Context

项目包含 `/admin`、`/api/auth/**` 和 `/api/**` 后台能力。账号认证依赖动态 API、数据库、cookie 和邮件；背景图管理依赖服务端文件系统写入；网易云音乐代理依赖上游 API、加密 cookie 和网页歌单数据库；ZJU 工具依赖 Node.js runtime、第三方站点请求、数据库任务记录和文件产物下载。这些能力无法由纯静态导出完整承载。

## Decision

生产环境使用 `next start` 运行 Next.js server，并通过 Caddy 反向代理 `hakureinoyume.com` 到 `127.0.0.1:3000`。涉及认证、后台、背景图、网易云代理、ZJU 工具和其他外部数据代理的 API route 明确声明 Node.js runtime 和动态行为或缓存策略。

## Consequences

- 可以使用 Next.js App Router 的动态 API、Better Auth、Prisma、SMTP、Node.js 文件系统能力、服务端第三方代理和后端任务执行器。
- 部署需要 systemd 或等价进程管理，不只是上传静态文件。
- 后续如果迁移到静态托管，需要先替换账号认证、数据库访问、邮件发送、背景图存储、网易云代理、ZJU 工具任务和文件产物下载方案。
