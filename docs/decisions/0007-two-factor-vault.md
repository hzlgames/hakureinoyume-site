# 0007 使用加密存储和浏览器内存实现 2FA 验证器

## Status

Accepted

## Context

工具箱需要为本站用户持久保存多个 Google Authenticator 兼容账号，批量导入并实时展示验证码。复用 Better Auth 登录和 PostgreSQL，避免另建账号体系或把密钥长期留在浏览器存储。

## Decision

- 新增独立的 `TwoFactorAccount` 表，每个用户隔离；将名称、服务商、密钥和算法参数作为整体用 AES-256-GCM 加密，AAD 绑定用户和记录 ID。
- 以 `TWO_FACTOR_ENCRYPTION_KEY` 或回退的 `BETTER_AUTH_SECRET` 经 HKDF 派生专用密钥；用户隔离的 HMAC 指纹用于去重，唯一约束与用户行锁防止并发重复及容量越界。
- 已认证 GET 在禁止缓存的响应中向当前用户浏览器传递账号明文，使用 [OTPAuth](https://github.com/hectorm/otpauth) 在 React 内存中生成 TOTP。不写 localStorage、IndexedDB 或日志，退出登录卸载状态；每分钟及重新聚焦时重新验证会话并同步，失败清空列表。
- [qr-scanner](https://github.com/nimiq/qr-scanner) 在浏览器内识别摄像头/图片；[protobuf.js](https://github.com/protobufjs/protobuf.js) 解析迁移载荷，wire 字段参考 [dim13/otpauth 的协议定义](https://github.com/dim13/otpauth/blob/master/migration/migration.proto)。所有库由 npm 本地构建，不加载第三方 CDN。上游库保留各自许可证。
- 多码迁移按批次检查完整性后保存。未知版本、算法、HOTP 或畸形数据整体拒绝；普通 TOTP URI 保留周期/算法/位数。删除按当前会话用户过滤，并要求同源写请求。

## Consequences

服务器持有解密能力，因此属于服务端加密托管，并非端到端加密。登录态能访问当前用户的全部密钥，默认隐藏只是界面防误露。保护数据库、应用密钥、服务器和登录会话都是安全边界的一部分。每个用户上限 500 个账号；不支持 HOTP，不提供在线密钥轮换。发布时必须应用数据库迁移并保持加密密钥稳定。
