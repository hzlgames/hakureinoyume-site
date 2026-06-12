# 功能总览

## 首页

首页由 `src/app/page.tsx` 进入，实际 UI 在 `src/app/home-experience.tsx`。它是一个仪表盘式个人站首页，包含固定导航、主题切换、移动端菜单、任务列表、学习轨迹、日记碎片、收藏、网易云播放器、天气、工具入口等展示模块。

首页会读取 Better Auth session。未登录时展示登录和注册入口；已登录时展示当前用户、退出按钮；管理员用户还会看到后台入口。

网易云播放器在 `src/app/_components/netease-player.tsx`。未登录本站时可使用公开/游客网易云访问能力进行搜索和播放；登录本站后，所有用户都可以维护站内网页歌单，通过二维码绑定自己的网易云账号，查看网易云歌单、收藏歌曲、搜索歌曲并播放。网易云接口统一经过 `/api/music/*` 服务端代理，网易云 cookie 不暴露给浏览器脚本。

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

首页当前在 `src/app/home-experience.tsx` 中维护 light/dark 主题 state，并写入 `document.documentElement.dataset.theme`。实际背景图由 `src/app/globals.css` 按 `data-theme` 切换：

- light：`public/backgrounds/bg-light.png`。
- dark：`public/backgrounds/bg-dark.png`。

`src/app/site-theme.ts` 仍定义站点名、背景选项、主题变量和自定义背景封装，当前主要被后台背景管理页用于上传预览、保存和重置流程。后台会写入 `localStorage` 的 `hakurei-home-background` key，但首页当前没有读取这个背景选择 key。

新增主题时，必须同时考虑正文、弱文本、边框、强调色、玻璃面板、阴影、hero wash 和背景滤镜等变量。

## 天气和日历

首页可通过 API 获取动态天气和节日日历数据：

- `GET /api/weather`：代理 Open-Meteo，默认经纬度是上海，也支持 `lat` 和 `lon` 查询参数。
- `GET /api/calendar`：聚合 `timor.tech`、`Nager.Date` 和本地 fallback，支持 `year` 查询参数。

这两个接口都使用 Node.js runtime，并设置 revalidate 缓存时间。

## 工具页

`/tools` 是工具箱入口页，当前包含 ZJU 工具合集入口。

ZJU 工具合集：

- `/tools/ZJU_tools`：登录用户验证、保存、更新或删除自己的 ZJU 学号、密码和可选 Pintia Cookie。已有账号可保留旧密码更新资料，也可清除 Pintia Cookie；凭据只加密保存在服务端，不回传明文。账号通过验证前不显示工具入口；通过验证后显示按服务分组（学在浙大 / 智云课堂 / 图书馆 / WebPlus）的工具索引。
- `/tools/ZJU_tools/courses.zju`：学在浙大工具索引页，列出已接入的小工具；需要当前用户已有通过验证的 ZJU 账号。
- `/tools/ZJU_tools/courses.zju/todos`：待办中心，支持刷新、搜索、来源筛选、紧急事项统计和外链跳转。
- `/tools/ZJU_tools/courses.zju/scores`：成绩查询，支持课程选择、分数读取、数量/平均分/类型分布统计和明细查看。
- `/tools/ZJU_tools/courses.zju/materials`：课程资料，支持课程选择、资料搜索、可见项全选、选中文件下载、任务日志、错误提示、取消运行任务和下载产物。
- `/tools/ZJU_tools/courses.zju/autoplay`：自动刷课，支持课程选择、读取可自动完成的活动、逐项挑选或刷全部未完成、选择倍速与拟真串行/强制重刷，按拟真节奏后台上报观看进度，可查看实时日志、成功/失败/跳过概览并取消任务。
- `/tools/ZJU_tools/courses.zju/quiz`：测验答案，支持选择课程、读取进行中的互动、创建答案读取任务、查看任务日志/取消任务，并在任务完成后展示题目选项和参考答案；要求当前用户已有验证 ZJU 账号。
- `/tools/ZJU_tools/classroom.zju`：智云课堂录播，支持课程选择、录播搜索、复制回放链接或在新标签打开，以及导出 PPT 截图 + 字幕的 Markdown 转录任务并下载产物。
- `/tools/ZJU_tools/lib.zju`：图书馆借阅，读取在借图书与到期状态（借阅中/即将到期/逾期），勾选可续借图书并一键续借。
- `/tools/ZJU_tools/webplus.zju`：WebPlus 通知存档，粘贴通知链接创建存档任务，保存页面 HTML 与全部附件并还原附件原名，可查看日志、取消任务、下载产物。
- 任务（资料下载、自动刷课、测验答案、课堂转录、WebPlus 存档）写入当前用户自己的任务记录和工作目录，可在页面查看日志、取消未完成任务、下载已完成文件；前端只拿到文件名和大小，服务端负责校验文件属于当前任务目录。
- 具体工具页面和工具 API 都要求 `lastValidatedAt` 存在；保存账号时会用同一组学号密码尝试多个学在浙大请求，任意成功即视为账号有效，直到用户删除或修改账号。
- `materialMaintainer` 增量维护暂未接入。

新增工具建议放在 `src/app/tools/<tool-name>/page.tsx` 或 `src/app/tools/<tool-suite>/<tool-name>/page.tsx`，并在功能文档中记录入口、输入输出和状态存储方式。

## 公共 UI

`src/app/_components/ui.tsx` 只保留轻量 primitives，不承载业务数据。当前包括：

- `GlassPanel`
- `DashboardCard`
- `CardHeader`
- `ProgressBar`

当同类结构重复出现 3 次以上，优先从页面中抽成组件；否则保持页面附近的业务结构，避免过早抽象。
