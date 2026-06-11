# 当前架构

## 技术栈

- Next.js App Router，源码入口在 `src/app`。
- React Client Component 承载首页交互、账号表单、后台表格、canvas 裁切和小宠物拖动。
- TypeScript 严格模式，路径解析使用 `moduleResolution: bundler`。
- 样式主要集中在 `src/app/globals.css`，少量动态主题变量来自 `src/app/site-theme.ts`。
- 图标使用 `lucide-react`，图片使用 `next/image` 或静态 public 资源。
- Better Auth 提供账号、会话、邮箱验证、密码重置和管理员插件。
- Prisma 7 + PostgreSQL 存储用户、会话、账号、验证 token 和管理员审计日志。
- Nodemailer 负责认证邮件发送。

## C4 视图

### Context

用户访问 `hakureinoyume.com`，Caddy 负责 HTTPS 入口和反向代理。Next.js 应用提供公开页面、账号页面、后台 API 和第三方数据代理 API。注册用户通过邮箱验证后登录，管理员通过 `/admin` 管理账号和站点背景。

### Container

- Web UI：`src/app/page.tsx` 渲染首页，实际交互在 `src/app/home-experience.tsx`。
- Auth UI：`/login`、`/register`、`/forgot-password`、`/reset-password` 处理账号登录、注册和密码重置。
- Admin UI：`src/app/admin/page.tsx` 管理当前账号信息、背景图预览/裁切/保存/重置、用户列表、角色、停用、会话撤销和密码重置。
- Tools UI：`/tools` 提供工具入口；`/tools/ZJU_tools` 管理用户级 ZJU 凭据并按服务分组展示工具索引；学在浙大（`courses.zju`：待办、成绩、资料下载、自动刷课）、智云课堂（`classroom.zju`：录播回放与转录）、图书馆（`lib.zju`：借阅续借）、WebPlus（`webplus.zju`：通知存档）各有独立工具页面。
- API Routes：`src/app/api/**/route.ts` 提供 Better Auth、后台用户管理、背景图、天气和节日日历接口。
- Data Layer：`prisma/schema.prisma` 定义 PostgreSQL schema，`src/lib/prisma.ts` 创建 Prisma client。
- Static Assets：`public/` 存放背景图、小宠物 spritesheet 和其他静态资源。
- Production Runtime：`next start` 运行动态 API，Caddy 代理到 `127.0.0.1:3000`。

### Component

- `src/app/_components/ui.tsx`：轻量 UI primitives，包括 `GlassPanel`、`DashboardCard`、`CardHeader`、`ProgressBar`。
- `src/app/_components/auth/auth-shell.tsx`：账号页面共享布局。
- `src/app/_components/interactive-mascot.tsx`：客户端小宠物组件，管理动画帧、拖动、悬停、点击、降级动效和视口约束。
- `src/app/site-theme.ts`：站点名、背景选项、CSS 变量集合、自定义背景封装和主题变量写入。
- `src/lib/auth.ts`：Better Auth 配置，接入 Prisma adapter、邮箱密码登录、邮箱验证、密码重置和 admin 插件。
- `src/lib/auth-client.ts`：浏览器端 Better Auth client。
- `src/lib/admin.ts`：读取当前 session，提供 `requireAdmin()` 和 `auditAdminAction()`。
- `src/lib/email.ts`：通过 SMTP 发送验证和密码重置邮件。
- `src/lib/zju.ts`：ZJU 账号加密保存，`login-zju` 的 `COURSES`/`CLASSROOM`/`APILIB` 客户端封装，以及学在浙大、智云课堂、图书馆和 WebPlus 的数据读取与后端任务执行（资料下载、自动刷课、课堂转录、通知存档）。
- `src/app/api/auth/[...all]/route.ts`：Better Auth 的 Next.js API handler。
- `src/app/api/admin/users/**`：管理员用户查询、角色切换、停用/恢复、会话撤销和密码重置。
- `src/app/api/background/route.ts`：读取、保存、删除管理员背景图，并记录审计日志。
- `src/app/api/weather/route.ts`：代理 Open-Meteo 当前天气。
- `src/app/api/calendar/route.ts`：聚合节假日来源并提供本地 fallback。
- `src/app/api/zju/**`：登录用户的 ZJU 账号、学在浙大课程/待办/成绩/资料/活动、智云课堂课程与录播、图书馆借阅与续借，以及工具任务接口。账号接口只要求 Better Auth session；具体工具接口还要求当前用户已有通过验证的 ZJU 账号，并按 `userId` 限定数据。

### Deployment

生产环境由 `deploy/hakureinoyume-site.service` 定义 systemd 服务，在 `/home/ubuntu/hakureinoyume-site` 内执行 `npm run start`。`Caddyfile` 将 `hakureinoyume.com` 反向代理到本机 3000 端口，并把 `www` 跳转到裸域名。

## 路由与接口

- `/`：首页，展示仪表盘式个人站。
- `/admin`：账号后台和背景图管理。
- `/login`：邮箱密码登录，支持重发验证邮件入口。
- `/register`：创建账号，注册后需要邮箱验证。
- `/forgot-password`：发起密码重置邮件。
- `/reset-password`：使用 token 设置新密码。
- `/tools`：工具箱入口页。
- `/tools/ZJU_tools`：ZJU 工具合集页，验证、保存或删除当前用户的 ZJU 学号、密码和可选 Pintia Cookie；已保存账号可保留旧密码更新资料或清除 Pintia Cookie。账号通过验证后显示按服务分组（学在浙大 / 智云课堂 / 图书馆 / WebPlus）的工具索引。
- `/tools/ZJU_tools/courses.zju`：学在浙大工具索引页，需要当前用户已有通过验证的 ZJU 账号。
- `/tools/ZJU_tools/courses.zju/todos`：待办中心，读取学在浙大与可选 Pintia 待办。
- `/tools/ZJU_tools/courses.zju/scores`：成绩查询，按课程读取作业和考试分数。
- `/tools/ZJU_tools/courses.zju/materials`：课程资料，按课程读取资料、选择文件、创建下载任务并管理任务产物。
- `/tools/ZJU_tools/courses.zju/autoplay`：自动刷课，按拟真倍速分段上报观看进度，自动完成视频/页面/资料活动，作为可取消的后端任务运行。
- `/tools/ZJU_tools/classroom.zju`：智云课堂录播，复制回放链接，或导出 PPT 截图与字幕的 Markdown 转录任务。
- `/tools/ZJU_tools/lib.zju`：图书馆借阅，查询在借图书与到期状态并续借。
- `/tools/ZJU_tools/webplus.zju`：WebPlus 通知存档，保存通知页面 HTML 与全部附件并还原附件原名。
- `/api/auth/[...all]`：Better Auth 统一认证接口，支持登录、注册、登出、邮箱验证、密码重置等动作。
- `GET /api/admin/users`：管理员分页搜索用户并读取最近审计日志。
- `POST /api/admin/users/[userId]/role`：管理员修改用户角色，允许 `admin` 和 `user`。
- `POST /api/admin/users/[userId]/ban`：管理员停用或恢复用户；停用时撤销该用户现有会话。
- `DELETE /api/admin/users/[userId]/sessions`：管理员撤销用户全部会话。
- `POST /api/admin/users/[userId]/password`：管理员为用户重置密码。
- `GET /api/background`：返回当前自定义背景图元信息。
- `POST /api/background`：管理员上传 webp data URL，写入 `public/backgrounds/admin-background.webp`。
- `DELETE /api/background`：管理员删除自定义背景图。
- `GET /api/weather`：返回指定经纬度或默认上海位置的当前天气。
- `GET /api/calendar`：返回指定年份的节假日和纪念日数据。
- `GET|PUT|DELETE /api/zju/account`：读取、验证保存、删除当前登录用户的 ZJU 凭据。密码和 Pintia Cookie 只加密入库，不回传明文；更新已有账号时可不重传密码，也可清除已保存的 Pintia Cookie。
- `GET /api/zju/courses`：读取当前用户的学在浙大课程列表，要求已验证 ZJU 账号。
- `GET /api/zju/courses/todos`：读取可靠待办，合并学在浙大和可选 Pintia 待办，要求已验证 ZJU 账号。
- `GET /api/zju/courses/[courseId]/scores`：读取指定课程的作业和考试分数，要求已验证 ZJU 账号。
- `GET /api/zju/courses/[courseId]/materials`：读取指定课程的资料列表，要求已验证 ZJU 账号。
- `GET /api/zju/courses/[courseId]/activities`：读取指定课程可自动完成的活动（视频/页面/资料）及完成状态，供自动刷课挑选，要求已验证 ZJU 账号。
- `GET /api/zju/classroom/courses`：读取智云课堂课程列表，要求已验证 ZJU 账号。
- `GET /api/zju/classroom/courses/[courseId]/videos`：读取指定智云课堂课程的录播列表与回放链接，要求已验证 ZJU 账号。
- `GET /api/zju/library/loans`：读取当前用户的图书馆在借图书与到期/可续借状态，要求已验证 ZJU 账号。
- `POST /api/zju/library/renew`：按条码续借选中的图书，要求已验证 ZJU 账号。
- `GET|POST /api/zju/jobs`：列出当前用户最近 ZJU 工具任务，或创建任务（课程资料下载 `courses.zju/materialDown`、自动刷课 `courses.zju/autoplay`、课堂转录 `classroom.zju/transcript`、WebPlus 存档 `webplus.zju/archive`），要求已验证 ZJU 账号。API 输出会过滤内部工作目录和文件绝对路径。
- `GET|DELETE /api/zju/jobs/[jobId]`：读取或取消当前用户自己的任务，要求已验证 ZJU 账号；任务输出同样只暴露前端需要的文件名、大小等信息。
- `GET /api/zju/jobs/[jobId]/files/[fileName]`：下载当前用户任务生成的资料文件，要求已验证 ZJU 账号，只允许读取该任务工作目录内的文件。

## 数据与状态

- PostgreSQL 是账号、会话和审计日志的数据源。
- Prisma schema 位于 `prisma/schema.prisma`，生成客户端位于 `src/generated/prisma/`。
- 初始迁移位于 `prisma/migrations/0001_init_auth/migration.sql`。
- 管理员自定义背景图以文件方式存储在 `public/backgrounds/admin-background.webp`。
- 背景图 API 使用文件 mtime 生成查询参数版本，避免浏览器长期缓存旧图。
- Better Auth 会话存储在数据库 `session` 表，并通过 Next.js cookie 维持浏览器登录态。
- ZJU 凭据存储在 `ZjuAccount`，学号明文用于识别，密码和 Pintia Cookie 使用 AES-256-GCM 加密，默认使用 `ZJU_ACCOUNT_SECRET`，未设置时回退 `BETTER_AUTH_SECRET`。保存时会用同一组学号密码尝试多个 `courses.zju` 请求，任意请求成功后更新 `lastValidatedAt`；用户删除或修改账号前，`lastValidatedAt` 作为已验证状态。
- ZJU 工具任务存储在 `ZjuToolJob`，记录输入、输出、日志、状态、退出码和用户专属工作目录。资料下载、课堂转录（Markdown 与 PPT 截图）和 WebPlus 存档（HTML 与附件）的产物默认写入 `.data/zju-tools/<userId>/<jobId>/`，可通过 `ZJU_TOOL_DATA_DIR` 覆盖根目录；自动刷课任务只产出日志与统计概览，不写文件。
- `ADMIN_EMAILS` 中的邮箱在用户创建前 hook 中自动获得 `admin` 角色。
- 首页主题状态目前为浏览器内 React state，后台会写入 `localStorage` 的背景选择 key。

## 关键约束

- 认证、数据库、邮件、背景图保存和第三方 API 代理依赖 Node.js runtime，因此相关 API 声明 `runtime = "nodejs"` 和动态行为或 revalidate。
- 生产不能只使用静态导出；动态 API 需要 `next start`。
- 生产必须设置 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、SMTP 配置、`AUTH_EMAIL_FROM` 和 `ADMIN_EMAILS`。
- ZJU 工具依赖 `login-zju` 包（`COURSES`/`CLASSROOM`/`APILIB` 客户端）和 Node.js runtime，并直连学在浙大、智云课堂、图书馆 aleph 与 WebPlus 站点。WebPlus 通知解析用定向正则，不依赖外部 HTML 解析库。生产建议设置 `ZJU_ACCOUNT_SECRET`，任务产物目录需要服务进程可写。
- 管理后台权限只认 session user 的 `role === "admin"`。
- 全局 CSS 体量较大，新增视觉能力前优先复用现有变量和 primitives。
