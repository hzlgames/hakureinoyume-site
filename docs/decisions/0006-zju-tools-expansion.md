# 0006 扩展 ZJU 工具至自动刷课与多服务

## Status

Accepted

## Context

[0005](0005-zju-tools-service-layer.md) 把 `ZJU-live-better` 的 `courses.zju` 只读与资料下载能力接入网页，并明确不接入「直接标记视频完成」与「读取测验答案」。后续需求是把 `ZJU-live-better` 的其余能力也接入网页，并让工具索引按服务分组、更清晰。

## Decision

在同一服务层（`src/lib/zju.ts`）和任务机制（`ZjuToolJob`）上扩展三类服务，复用按 `userId` 隔离的加密凭据：

- 学在浙大新增「自动刷课」：移植 `course_autoplay/autoplay-paced.mjs` 的拟真倍速方案，按真实播放节奏分段上报观看进度，纯请求、不在浏览器播放，作为可取消的后端任务运行。本条**部分推翻 0005**中「不接入视频完成」的约束。
- 智云课堂（`CLASSROOM` 客户端）：录播回放链接读取，以及 PPT 截图 + 字幕的 Markdown 转录导出任务。
- 图书馆（`APILIB` 客户端）：在借图书查询与续借。
- WebPlus：通知页面与附件存档任务；离线环境无法引入 cheerio，改用定向正则解析。

`测验答案读取` 仍**不接入**，因其用于考试作弊。`materialMaintainer` 增量维护暂不接入，与课程资料下载重叠且依赖本地缓存文件。

工具索引（`/tools/ZJU_tools`）改为按服务分组：学在浙大 / 智云课堂 / 图书馆 / WebPlus。

## Consequences

- 服务边界从单一 `courses.zju` 扩展到 `login-zju` 的 `COURSES`、`CLASSROOM`、`APILIB` 多个客户端，触达 `education.cmc.zju.edu.cn`、`yjapi.cmc.zju.edu.cn`、`classroom.zju.edu.cn`、`api.lib.zju.edu.cn` 及 WebPlus 站点。
- 任务执行器并行上报时用单写者日志器整体覆盖写入，避免并行任务互相覆盖日志行。
- 转录与存档任务同样把产物写入用户专属工作目录，沿用既有文件下载接口与路径校验。
- 自动刷课等聚合行为在时间维度可被后端审计识别；属使用者风险，不在本仓库处理。
