# 功能总览

## 首页

首页由 `src/app/page.tsx` 进入，实际 UI 在 `src/app/home-experience.tsx`。它是一个仪表盘式个人站首页，包含固定导航、主题切换、移动端菜单、任务列表、学习轨迹、日记碎片、收藏、播放器、天气、工具入口等展示模块。

首页会读取 Better Auth session。未登录时展示登录和注册入口；已登录时展示当前用户、退出按钮；管理员用户还会看到后台入口。

## 账号系统

项目使用 Better Auth 多用户账号系统。用户可以注册、登录、验证邮箱、请求密码重置和设置新密码。

账号页面：

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

注册后需要完成邮箱验证。密码重置邮件通过 SMTP 发送，重置后会撤销已有会话。

## 后台管理

`/admin` 是客户端后台页面。未登录时引导到 `/login?callback=/admin`；已登录但不是 `admin` 角色时显示无权限状态。

管理员后台包含：

- 当前管理员账号信息。
- 背景图上传、canvas 裁切、保存和重置。
- 账号后台：分页搜索用户、查看邮箱验证状态、角色、停用状态、会话数和创建时间。
- 用户操作：设为管理员/用户、停用/恢复、撤销会话、重置密码。
- 最近管理员操作记录。

## 背景管理

后台可上传图片、在 canvas 中裁切为 1600x1000 webp，再提交到背景图 API。

保存路径为 `public/backgrounds/admin-background.webp`。重置操作会删除该文件并恢复预设背景。更新和重置背景都要求 `admin` 角色，并写入管理员审计日志。

## 互动小宠物

`InteractiveMascot` 使用 `public/pets/reimu-mini/spritesheet.webp` 和 8x9 atlas 配置播放动画。组件支持待机、左右跑动、挥手、跳跃、失败、等待、拖动和 review 状态。

组件要点：

- 只在客户端运行。
- 使用 pointer events 支持拖动。
- 会根据视口、滚动、resize 和 focus 约束位置。
- 尊重 `prefers-reduced-motion`，减少动效时固定第一帧。
- 对应素材审查和生成记录在 `docs/pets/reimu-mini/`。

## 主题与背景

`src/app/site-theme.ts` 定义站点名、背景选项、主题变量和自定义背景封装。当前预设背景包括：

- `dawn`：晨光神社。
- `boundary`：樱色结界。
- `night`：符卡夜色。
- `custom`：由后台上传后生成。

新增主题时，必须同时考虑正文、弱文本、边框、强调色、玻璃面板、阴影、hero wash 和背景滤镜等变量。

## 天气和日历

首页可通过 API 获取动态天气和节日日历数据：

- `GET /api/weather`：代理 Open-Meteo，默认经纬度是上海，也支持 `lat` 和 `lon` 查询参数。
- `GET /api/calendar`：聚合 `timor.tech`、`Nager.Date` 和本地 fallback，支持 `year` 查询参数。

这两个接口都使用 Node.js runtime，并设置 revalidate 缓存时间。

## 工具页

`/tools` 目前是占位页，用于后续小工具和实验。新增工具建议放在 `src/app/tools/<tool-name>/page.tsx`，并在功能文档中记录入口、输入输出和状态存储方式。

## 公共 UI

`src/app/_components/ui.tsx` 只保留轻量 primitives，不承载业务数据。当前包括：

- `GlassPanel`
- `DashboardCard`
- `CardHeader`
- `ProgressBar`

当同类结构重复出现 3 次以上，优先从页面中抽成组件；否则保持页面附近的业务结构，避免过早抽象。
