# 开发与部署

## 本地命令

- `npm run dev`：启动本地开发服务器。
- `npm run lint`：运行 ESLint，当前配置要求 0 warning。
- `npm run build`：构建 Next.js 应用。
- `npm run start`：以生产模式启动 Next.js server。
- `npm run deploy`：当前等同于 `npm run build`。

Prisma 相关命令通过 `npx prisma ...` 执行。当前仓库没有单独 npm script。

## 环境变量

- `DATABASE_URL`：PostgreSQL 连接串，Prisma 和 Better Auth 必需。
- `BETTER_AUTH_SECRET`：Better Auth 签名密钥，生产必须使用长随机值。
- `BETTER_AUTH_URL`：站点基础 URL，生产为 `https://hakureinoyume.com`。
- `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`：验证邮件和密码重置邮件的 SMTP 配置。
- `AUTH_EMAIL_FROM`：认证邮件发件人。
- `ADMIN_EMAILS`：逗号分隔的管理员邮箱。新用户创建时命中该列表会获得 `admin` 角色。
- `NETEASE_API_BASE_URL`：网易云音乐 API 服务地址，默认开发值为 `http://localhost:3010`。生产应指向自托管 NeteaseCloudMusicApi Enhanced 或兼容服务，不建议把真实账号 cookie 发给公开演示站。
- `NETEASE_COOKIE_SECRET`：网易云 cookie 入库加密密钥。未设置时回退使用 `BETTER_AUTH_SECRET`。
- `NODE_ENV=production`：生产服务使用。
- `PORT=3000`：systemd 服务中声明的端口。

生产服务从 `/etc/hakureinoyume-site.env` 加载环境变量。`.env.example` 记录了当前必需变量。

## 数据库与迁移

Prisma 配置在 `prisma.config.ts`，schema 在 `prisma/schema.prisma`，迁移在 `prisma/migrations/`。

部署前需要：

1. 配置 `DATABASE_URL`。
2. 对目标 PostgreSQL 执行迁移。
3. 确认生成的 Prisma client 与 schema 对齐。

常用命令：

- `npx prisma migrate deploy`：在生产或类生产环境应用已提交迁移。
- `npx prisma generate`：按 schema 生成 Prisma client。

## 生产运行

`deploy/hakureinoyume-site.service` 定义 systemd 服务：

- 工作目录：`/home/ubuntu/hakureinoyume-site`
- 启动命令：`/usr/local/bin/npm run start`
- 重启策略：失败后 5 秒重启
- 端口：3000

`Caddyfile` 定义公开入口：

- `hakureinoyume.com` 反向代理到 `127.0.0.1:3000`
- 启用 zstd/gzip
- 设置基础安全响应头
- `www.hakureinoyume.com` 永久跳转到裸域名

## 动态 API 约束

认证、账号后台、背景管理、天气、日历代理和网易云音乐代理依赖 Next.js 动态 API、Node.js runtime、数据库、SMTP、外部 API 或文件系统能力。生产需要运行 `next start`，不能只依赖静态 `out/` 目录。

网易云播放器需要额外运行兼容 NeteaseCloudMusicApi Enhanced 的服务。本站只保存加密后的用户级网易云 cookie；当上游返回登录失效时，`/api/music/*` 会标记该用户的网易云登录态过期并提示重新扫码。

`out/` 是生成产物，已在 ESLint 和 Git 忽略配置中排除。维护文档时不要把 `out/` 当作源码事实来源。

## 故障排查

- 注册或登录失败：检查 `DATABASE_URL`、Better Auth 环境变量和数据库迁移是否完成。
- 验证邮件或密码重置失败：检查 SMTP 变量和服务器出站邮件能力。
- 管理员无法进入 `/admin`：确认当前用户邮箱在 `ADMIN_EMAILS` 中，或数据库 `User.role` 已设为 `admin`。
- 登录后保存背景失败：检查 session 是否过期、用户是否为 admin、请求是否命中 `/api/background`，确认服务进程对 `public/backgrounds` 有写权限。
- 保存后前台仍显示旧背景：检查 API 返回的 `?v=<mtime>` 是否变化，必要时刷新浏览器缓存。
- 生产 API 404 或不可用：确认服务不是静态文件托管，必须是 `npm run start` 后由 Caddy 代理。
- 样式异常：优先检查 `src/app/globals.css` 中变量和响应式断点，再检查 `site-theme.ts` 注入的 CSS 变量。
