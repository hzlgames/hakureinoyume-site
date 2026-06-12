# 0006 使用服务端代理承载网易云播放器

## Status

Accepted

## Context

首页包含网易云播放器。公开访问需要搜索和播放能力；登录本站的用户还需要绑定自己的网易云账号、读取网易云歌单、维护站内网页歌单并播放歌曲。

网易云 cookie 不能暴露给浏览器脚本，也不应要求前端直接访问上游网易云 API 兼容服务。网页歌单需要跟随本站账号持久化。

## Decision

网易云能力通过 `src/app/api/music/[...music]/route.ts` 的服务端代理提供。服务端调用 `src/lib/netease.ts`，默认连接 `NETEASE_API_BASE_URL` 指向的自托管 NeteaseCloudMusicApi Enhanced 或兼容服务。

未绑定网易云账号时，服务端使用匿名网易云 cookie 支持公开搜索和播放。登录本站后，用户可以通过二维码绑定网易云账号；服务端把用户级网易云 cookie 加密保存到 `NeteaseAccount`，加密密钥优先使用 `NETEASE_COOKIE_SECRET`，未设置时回退 `BETTER_AUTH_SECRET`。

站内网页歌单存储在 `WebMusicPlaylist` 和 `WebMusicPlaylistSong`，支持读取、添加、删除和排序。`/api/music/*` 还代理网易云账号状态、二维码登录/登出、搜索、专辑歌曲、用户歌单、歌单歌曲、播放地址、收藏和歌词。

## Consequences

- 浏览器不直接持有网易云 cookie，网易云登录态只在服务端解密使用。
- 网易云播放器依赖 Node.js runtime、数据库和外部兼容 API 服务，生产不能用静态导出替代。
- 生产环境应设置 `NETEASE_API_BASE_URL`，并建议设置独立的 `NETEASE_COOKIE_SECRET`。
- 当上游返回登录失效时，服务端会标记该用户的网易云登录态过期，并要求重新扫码绑定。
- 上游兼容服务不可用时，网易云搜索、歌单和播放能力会受影响，但不会影响本站账号系统。
