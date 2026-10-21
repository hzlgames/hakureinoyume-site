# 0008 使用独立服务承载 LUMIÈRE 子目录站点

## Status

Accepted

## Context

LUMIÈRE 虚仿项目是独立私有仓库，包含产品介绍、Vite 构建的四端页面、AI 代理和 WebSocket 联动，需要从 `https://hakureinoyume.com/LUMIEREdisplay` 进入。其根路径 API 与主站同名，不能直接占用域名根路由。

## Decision

由独立 systemd 服务 `lumiere-virtual-lab` 在 `127.0.0.1:5180` 运行 LUMIÈRE。Caddy 将 `/LUMIEREdisplay/*` 剥离前缀后转发至该服务，其他请求继续进入 Next.js 的 3000 端口。LUMIÈRE 使用构建与运行时一致的 `PUBLIC_BASE_PATH` 生成公开地址。AI 配置保存在单独的 root 专属环境文件中。

## Consequences

两项服务可独立更新和重启，主站不需要导入 LUMIÈRE 代码或为其开放根路径 API。维护 Caddy 时必须保留分流规则；修改公开前缀时须同时更新 LUMIÈRE 构建、运行环境和代理。访客仍免登录，数据隔离和浏览器缓存由 LUMIÈRE 自己管理。
