# 0005 使用内置服务层承载并扩展 ZJU 工具

## Status

Accepted

## Context

`ZJU-live-better` 原本是命令行脚本集合，依赖 `.env`、交互式选择和本地工作目录。网站需要把其中的 ZJU 能力变成登录后的网页工具，同时保证多用户凭据、任务、日志和文件产物互相隔离。

最初接入范围集中在 `courses.zju` 的课程查看与资料下载。后续需求扩展为按服务分组的工具合集，覆盖学在浙大、智云课堂、图书馆和 WebPlus。

## Decision

网站不直接暴露共享命令行进程。ZJU 工具通过 `src/lib/zju/` 服务层调用 `login-zju` 和各 ZJU 站点 API。

用户级 ZJU 凭据存储在 `ZjuAccount`，密码和 Pintia Cookie 使用 AES-256-GCM 加密。长任务存储在 `ZjuToolJob`，任务日志和文件产物写入用户专属工作目录。

服务层按能力拆分，`src/lib/zju/index.ts` 统一导出：

- 学在浙大（`COURSES` 客户端）：待办、成绩、课程资料下载、互动测验答案读取和可取消的自动刷课任务。
- 智云课堂（`CLASSROOM` 客户端）：录播回放链接读取、直播与回放 Web 播放器、课程直播检测，以及 PPT 截图 + 字幕的 Markdown 转录导出任务。直播批量检测使用 `classroom.zju/live-scan` 任务，保留部分失败提示；签名播放链接按需获取，不持久化缓存。
- 图书馆（`APILIB` 客户端）：在借图书查询与续借。
- WebPlus：通知页面与附件存档任务；使用 Cheerio 按上游提取正文和附件。

工具索引（`/tools/ZJU_tools`）按服务分组：学在浙大 / 智云课堂 / 图书馆 / WebPlus。

## Consequences

- 后端可以按 Better Auth `userId` 做数据与产物隔离。
- 任务状态、日志、错误和退出信息可被页面轮询，不依赖浏览器持有进程。
- 生产环境需要运行数据库迁移并保证 `ZJU_TOOL_DATA_DIR` 可写。
- 当前内置任务执行器适合单个 Next.js 服务实例；如果未来多实例部署，需要把任务调度和取消状态迁移到外部队列或 worker。
- 服务边界从单一 `courses.zju` 扩展到 `login-zju` 的 `COURSES`、`CLASSROOM`、`APILIB` 多个客户端，触达 `education.cmc.zju.edu.cn`、`yjapi.cmc.zju.edu.cn`、`classroom.zju.edu.cn`、`api.lib.zju.edu.cn` 及 WebPlus 站点。
- 任务执行器并行上报时用单写者日志器整体覆盖写入，避免并行任务互相覆盖日志行。
- 资料下载、课堂转录和 WebPlus 存档任务都沿用既有文件下载接口与路径校验；测验答案任务同时导出 HTML，自动刷课只产出日志与结构化输出。


## 2026-09-13 扩展

对齐上游 `d63adc8`（不包含 autosign），新增 `ALT` 评教和 `ZDBK` 正式成绩监控，以及资料增量缓存、测验富文本/HTML 导出。`ZjuToolState` 保存用户级状态和加密通知配置，独立 systemd timer 驱动监控与文件清理。下载产物从创建起保留 47 小时（小于两天），多文件 ZIP 与 Markdown 图片打包由统一产物模块处理。

## 认证与待办读取约束

- `client-login.ts` 在每个 `COURSES` 客户端内共享进行中的登录请求，避免首次并发读取触发多次 SSO；登录失败后允许重试，不跨账号共享认证。
- `courses-todos.ts` 按 `/api/my-semesters` 的起止日期和北京时间选择当前学期，边界包含当天；不使用学期 ID 偏移或仅依赖 `is_active`。学期间隙返回空列表，日期缺失或异常明确报错。
- 待办从当前学期课程活动、测验和课堂互动聚合，结合提交与完成状态排除已完成事项及普通资料、视频；不单独依赖 `/api/todos`。必要的状态读取失败时返回错误，避免误报未完成事项。
- 智云直播客户端先完成认证再启动各 API 的超时计时；仅已知课程目录接口接受 `code=1000/status=200` 成功包络，并继续校验返回数据形状。
