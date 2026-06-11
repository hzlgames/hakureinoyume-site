# 0005 使用内置服务层承载 ZJU 工具

## Status

Accepted

## Context

`ZJU-live-better` 原本是命令行脚本集合，依赖 `.env`、交互式选择和本地工作目录。网站需要把其中的 `courses.zju` 能力变成登录后的网页工具，同时保证多用户凭据、任务、日志和文件产物互相隔离。

## Decision

网站不直接暴露共享命令行进程。ZJU 工具通过 `src/lib/zju.ts` 的服务层调用 `login-zju` 和学在浙大 API。

用户级 ZJU 凭据存储在 `ZjuAccount`，密码和 Pintia Cookie 使用 AES-256-GCM 加密。长任务存储在 `ZjuToolJob`，当前先支持课程资料下载任务，任务输出写入用户专属工作目录。

`courses.zju` 页面最初只接入正常查看和资料下载类功能。原命令行中会直接标记视频完成或读取测验答案的能力当时不接入网页执行（视频完成约束后由 [0006](0006-zju-tools-expansion.md) 推翻，测验答案读取仍不接入）。

## Consequences

- 后端可以按 Better Auth `userId` 做数据与产物隔离。
- 任务状态、日志、错误和退出信息可被页面轮询，不依赖浏览器持有进程。
- 生产环境需要运行数据库迁移并保证 `ZJU_TOOL_DATA_DIR` 可写。
- 当前内置任务执行器适合单个 Next.js 服务实例；如果未来多实例部署，需要把任务调度和取消状态迁移到外部队列或 worker。
