# 博麗の夢项目文档

这是仓库内项目知识的入口。后续 agent 维护项目时，先从这里判断要读哪些文档，再回到源码确认事实。

## 快速阅读路径

- 新 agent 接手项目：先读 [当前架构](architecture/current-architecture.md)，再读 [功能总览](features/feature-overview.md) 和 [开发与部署](operations/development-and-deployment.md)。
- 修改页面、组件或主题：读 [功能总览](features/feature-overview.md)、[前端规范](frontend-guidelines.md) 和 [当前架构](architecture/current-architecture.md)。
- 修改 API、认证或背景图存储：读 [当前架构](architecture/current-architecture.md)、[认证架构](architecture/authentication.md)、[开发与部署](operations/development-and-deployment.md) 和 [架构决策](decisions/README.md)。
- 修改部署、环境变量或生产服务：读 [开发与部署](operations/development-and-deployment.md) 和 [架构决策](decisions/README.md)。
- 准备 Git 远端同步：必须读 [知识维护规则](knowledge-maintenance.md)，按规则更新文档或说明无需更新。

## 文档地图

- `architecture/`：系统结构、运行时边界、C4 视图、关键数据流。
- `features/`：当前用户功能、页面行为和素材约束。
- `operations/`：本地开发、构建、部署、环境变量和排障。
- `decisions/`：ADR，记录长期技术选择及原因。
- `frontend-guidelines.md`：前端样式、组件和 CSS 约定。
- `knowledge-maintenance.md`：agent 修改项目后如何维护知识库。

## 当前项目摘要

本项目是 `hakureinoyume.com` 的个人网站，使用 Next.js App Router 和 TypeScript。当前主要功能包括首页仪表盘、互动灵梦小宠物、Better Auth 多用户账号系统、后台账号与背景管理、网易云播放器、ZJU 工具箱、天气与节日日历 API，以及通过 Caddy 和 systemd 运行的生产部署。
