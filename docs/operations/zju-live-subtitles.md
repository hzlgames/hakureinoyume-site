# 智云直播共享字幕

## 行为与运行边界

直播页的字幕按钮订阅当前课节的共享识别任务；同一平台租户、课程 ID、课节 ID 和教室音源只产生一个任务。切换教师/课件/学生画面不改变识别音源，只有上游明确标记的教室（教师）流被解码和上传。未知画面不会作为音源兜底。

服务器提取 16 kHz、单声道、16-bit PCM，通过火山引擎 `bigmodel_async` 双向流式 ASR 2.0 获取修订文本和确定分句。此功能参考用户提供的 `classroom.zju.zip` 中 `asr/{protocol,config,stream}.mjs`；项目保留协议/流式模块，并新增网站任务协调、分片时间映射、持久化和访问授权。它不使用录音文件提交接口。

浏览器每 1.2 秒按 revision 增量读取确定分句，临时句尾允许修改。确定分句的写入和版本更新在同一事务提交。页面刷新从完整数据库快照恢复，再接收增量；URL 保留选定课程和课节，sessionStorage 仅保存字幕显示偏好，不保存凭据或转写结果。

桌面 HLS.js 使用当前播放分片的序号和起点，对应服务器的分片锚点；暂停后字幕跟随视频进度。动态 TextTrack 显示字幕，并兼容浏览器的视频全屏。原生 HLS 与其他画面缺少同一音源的可靠分片锚点时，界面明确显示为实时转写，不能承诺精确同步。已下课、回放尚未生成时，仍可打开已保存字幕。回放页显示历史记录，首版不把直播期间的相对时间轴直接套到回放视频上。

共享识别不能补回首次开启前或无人停止期间的声音。直播签名失效时重新解析地址；播放列表的短暂断线允许三次有限重试，能取到的旧分片会接续处理，已从直播窗口消失的声音记为缺口。音源序号重置会中止该次处理，避免把字幕放到错误时间位置。

## 数据与授权

迁移：`0010_live_subtitles`、`0011_subtitle_access_grants` 和 `0012_subtitle_partial_timing`。`ZjuLiveSubtitle` 保存共享状态、租约、代次、时长和有效期；`Cue` 保存确定分句；`Segment` 保存媒体分片锚点；`Viewer` 保存每个观看窗口的心跳；`Grant` 保存直播期间已经验证过的用户访问记录；`DailyUsage` 保存北京时间按日累计的音频预算。

开启字幕前，使用当前用户保存的 ZJU 凭据读取实际课节与教室音源。历史读取仍要求有效站内会话、有效 ZJU 绑定以及该账号可读取对应课程目录。课后转码期间尚无回放地址时，仅已获授权的观看者可以读取缓存；新用户需要正常访问直播音源或已生成的回放。解绑或改绑其他 ZJU 账号时清除个人字幕访问记录和订阅，不删除其他用户共享的字幕。初次授权实际检查对应教室/回放媒体的可访问响应，不以“返回了地址”代替权限验证。不同用户共享文本，不共享学校凭据、播放签名或火山密钥。

共享任务不属于某一个用户。取流凭据失效后，会从仍有订阅记录的授权用户中重新选择有效账号。每个页面窗口单独登记，关闭一个窗口不取消其他人的任务。最后一个活跃窗口离开后等待 3 分钟；异常离开还有最长 45 秒心跳过期时间。

数据默认从创建起保留 7 天，正常确认直播结束后改为结束时起 7 天。浏览、刷新和订阅心跳不延长有效期。暂停/失败保留原期限。API 到期立即拒绝返回数据，后台每分钟和独立定时器每 15 分钟清理父记录，字幕、分片、订阅与访问记录通过外键级联删除。无长期音视频文件；单个 TS 分片及解码 PCM 只存在内存中。

## 独立后台进程

```bash
npm run subtitles:worker
npm run subtitles:cleanup
```

网站进程只登记/订阅/读取任务。后台进程使用 PostgreSQL 事务级 advisory lock 限制全局并发，并用 20 秒租约、5 秒续租与 generation 防止重复运行。租约接管后的旧进程不能继续写入字幕；启动恢复总共最多四次尝试。停止进程保留确定字幕，重启后重新订阅可恢复；中断附近可能缺失未确定句尾。

生产部署模板为 `deploy/zju-live-subtitles.service` 和 `deploy/zju-live-subtitle-cleanup.{service,timer}`。部署时安装并启用后台服务及清理定时器；先确认服务端密钥、FFmpeg 和数据库配置可用。后台服务使用工作目录的 `.env` 与 `/etc/hakureinoyume-site.env` 中的同一数据库和账号加密配置，CPU/内存由 systemd 限制，网页服务重启不会重启该后台服务。

## 服务端配置

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `DOUBAO_ASR_API_KEY` | 必需或通过下项读取 | 仅后台使用的 API Key，禁止 `NEXT_PUBLIC_` 前缀 |
| `DOUBAO_ASR_KEY_ENV` | 空 | 可选服务端 `.env` 绝对路径，读取 `DOUBAO_ASR_API_KEY` 或 `API_KEY` |
| `DOUBAO_ASR_STREAM_RESOURCE_ID` | `volc.seedasr.sauc.duration` | 2.0 小时版资源；需要对应资源权限 |
| `FFMPEG_PATH` | `ffmpeg` | 解码程序 |
| `ZJU_SUBTITLE_MAX_CONCURRENT` | 2 | 服务器全局同时识别课节数，范围 1–8 |
| `ZJU_SUBTITLE_DAILY_MINUTES` | 120 | 北京时间每天的总音频预算，范围 1–14400 分钟 |
| `ZJU_SUBTITLE_MAX_LESSON_MINUTES` | 240 | 单课节累计音频上限，范围 1–480 分钟 |
| `ZJU_SUBTITLE_SESSION_SECONDS` | 300 | ASR 会话轮换时长，范围 10–600 秒 |

音频预算在分片上传前原子预留，停止或异常时可能多计最后一个已解码分片。这是用于限额的保守估算，不是火山账单。预算耗尽停止任务；读取已保存字幕免费且不重开识别。相邻会话保留待发送 PCM，短时尾包等待计入总延迟；不能根据首字时间承诺课堂到字幕的总延迟。

## API

`GET /api/zju/classroom/live/subtitles?courseId=…&subId=…&after=…` 返回完整或增量快照，`after` 为上次 revision，省略时返回历史。数据使用 `private, no-store`。

`POST` 同一路径使用 `{courseId, subId, clientId, action}`：

- `join`：授权后创建或加入共享任务；刷新不清空历史。
- `heartbeat`：续订当前观看窗口。
- `leave`：离开当前窗口，不影响其他窗口。
- `stop`：仅站内管理员可停止该课节，保留已有字幕。

所有 POST 必须携带与 `BETTER_AUTH_URL` 一致的 Origin。服务端不接受客户端媒体 URL、FFmpeg 参数、云端 endpoint 或密钥。

## 验证

基础回归：

```bash
node --import dotenv/config --import tsx --test tests/zju-subtitles.test.ts tests/zju-live.test.ts tests/zju-classroom.test.ts
```

数据库回归 `tests/zju-subtitles-db.test.ts` 必须显式设置 `ZJU_SUBTITLE_DB_TESTS=1`，且数据库名以 `hakurei_subtitles_regression_` 开头；验证八个并发领取者只有一项任务、租约接管、旧进程写入拒绝、修订去重和七天过期级联删除。测试不会在生产数据库运行。

本地 WebSocket 使用实际二进制协议验证 2 小时模拟音频、120 次连续会话轮换及时间偏移。它验证客户端流程，不代表火山引擎连续 2 小时的可用性。浏览器回归见 `tests/browser/zju-subtitles.mjs`，使用明确标记的字幕/媒体 fixture 验证按钮、刷新、暂停、字幕轨道数量、全屏和桌面/移动端明暗主题。

真实课程验证与限制见 [本次验证记录](zju-live-subtitles-validation.md)。

付费长时间集成测试入口为 `tests/integration/zju-subtitles-replay.ts`。必须显式设置 `RUN_PAID_SUBTITLE_TEST=1`，使用名称以 `hakurei_subtitles_replay_validation_` 开头的新测试数据库，并预先复制两个已有授权用户的站内资料和加密 ZJU 绑定。`SUBTITLE_REPLAY_MANIFEST` 指向只在服务器保存的私有 JSON：`{courseId,subId,url,startSeconds}`，其中 URL 来自该课节正常授权回放接口，不提交到仓库。测试使用两项独立后台进程竞争一个课节，在五分钟时强制终止活动进程，在七分钟时退出一个观看窗口，再完成默认二十分钟的真实 ASR、字幕持久化和双用户读取。`SUBTITLE_TEST_MINUTES` 可在 6–30 分钟内调整；`SUBTITLE_TEST_REPORT` 指定不含密钥或媒体地址的结果文件。

```bash
RUN_PAID_SUBTITLE_TEST=1 SUBTITLE_REPLAY_MANIFEST=/absolute/private/manifest.json node --env-file=/absolute/private/review.env --import tsx tests/integration/zju-subtitles-replay.ts
```

## 2026-10-31 生产部署

- 从当时生产版本 `bd4a565` 集成字幕分支 `413e86d`，应用版本为 `12d9225`。保留已有 2FA 功能、LUMIÈRE ADR 和 `/LUMIEREdisplay/*` Caddy 分流；字幕 ADR 顺延为 0009。
- 生产已应用三项字幕迁移，启用 `zju-live-subtitles.service` 和 `zju-live-subtitle-cleanup.timer`，手动清理成功。密钥文件为服务器上的 `/etc/hakureinoyume-subtitles.env`（服务用户所有、0600），由 `/etc/hakureinoyume-site.env` 的 `DOUBAO_ASR_KEY_ENV` 指向。保留默认全站并发 2、每天总音频 120 分钟、单课节 240 分钟上限。
- 发布前在隔离工作目录完成 lint、TypeScript 和 webpack 生产构建。19 项字幕/智云回归（含隔离数据库并发、租约接管、旧进程写入拦截、历史恢复、七天清理及两小时加速模拟）和 6 项 2FA 回归通过。
- 预览站与线上浏览器均使用明确的字幕/媒体 fixture 检查开关、暂停、全屏、单轨道、F5 恢复及桌面/手机明暗主题，无页面异常。线上另用两个现有用户的临时会话实际读取《证据法学》课节字幕 API，均为 200，未登录为 401、跨来源写入为 403；临时会话已删除。该旧课节生产库无字幕，未从测试库导入历史。
- 真实火山引擎连接使用 3 秒静音验证密钥与资源权限，收到最终响应；它仅证明云端连接可用，长时间真实语音与故障恢复证据仍见 2026-10-14 的验证记录，未在此次发布重跑整节直播。
- 主站与直播页面返回 200；LUMIÈRE 首页内容 SHA-256 与发布前一致，CSS/JS 返回 200。Caddy 文件未改变，LUMIÈRE 服务 PID 和启动时间未改变。
- 数据库与旧构建、依赖保存在服务器私有目录 `/home/ubuntu/.cache/hakurei-releases/live-subtitles-backup/`。回滚应用时先停止字幕 worker，恢复旧代码、构建和依赖；新增字幕表为独立附加数据，不通过回滚迁移删除用户数据。


## 与回放共享识别预算

回放标准版识别与直播共用同一 worker、并发锁和北京时间每日预算。账户级 `asrQuotaExempt` 请求在场时，后续音频用量单独记录，不消耗普通预算且豁免直播单课节时长上限；并发和资源限制继续生效。直播字幕仍只保留七天，回放 SRT/TXT 长期保存。具体配置和中止边界见 [回放转录运维](zju-replay-transcripts.md)。
