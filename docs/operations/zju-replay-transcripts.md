# 智云课堂回放转录

## 导出选择与缓存

课堂录播页有两种转录来源：默认“智云课堂字幕”保持 PPT 图片 + Markdown / ZIP 的导出行为及 47 小时文件期限；“火山引擎转写”使用豆包录音文件识别 2.0 标准版，导出 UTF-8 BOM 的 SRT 和 TXT。

后者以租户、课程和实际课节为唯一缓存身份。`ZjuReplayTranscript`、`ZjuReplayTranscriptChunk` 长期保存文本、时间戳、原提交 ID 和处理进度，不设置七天过期。直播的七天期限保持原样。每个用户持有独立 `ZjuToolJob` 请求，共享结果不属于第一个发起者。后续导出已完成课节直接获得下载文件，不再转写；中途恢复接续已完成分段。

创建任务与每次文件下载均重新验证调用者自己的 ZJU 绑定和对应回放访问权限。字幕不是公开资源，用户不能读取另一个用户的任务或文件链接。服务器不接收客户端指定的媒体 URL、ASR endpoint、资源 ID 或密钥。创建和中止任务要求同源 Origin。

## 媒体与云端接口

参考用户指定的 [doubao-asr-subtitles skill](/home/ubuntu/.codex/skills/doubao-asr-subtitles/SKILL.md) 的标准 `submit/query` 协议和 SRT 导出规则，应用内使用 TypeScript 实现任务协调，不运行 Python 子进程。

后台从上游重新取得授权回放地址。FFprobe 确认音轨时长，FFmpeg 按需读取媒体范围，只解码第一音轨，丢弃所有视频。媒体来源域名由既有智云授权层限制。协议白名单包括 HTTP/HTTPS、服务器已有 HTTP 代理所需的 httpproxy、TCP/TLS，禁止本地文件协议。

每段最多 60 秒、16 kHz 单声道 16-bit PCM，严格以采样数截断；45–60 秒之间优先找至少 300 ms 的低能量停顿，在停顿中间切分，无合适停顿才截到上限。相邻段重叠 1.5 秒，合并时校正实际音频起点并去除边界重复前缀；标题和最近 256 字转写通过官方 `corpus.context`（`dialog_ctx`）传递，辅助专有名词及语境。末段保留完整音频。重叠额外用量也进入同一预算，连续满段约增加 2.6%，短段略高；不保证与整课识别质量等同。最大 1,920,000 字节 PCM，加 WAV 头后以小载荷 `audio.data` 提交。裸 PCM 在本次真实接口验证返回格式错误，WAV 封装验证成功。不把整堂课 base64 上传，不把学校签名 URL 交给火山引擎。视频与音频不写临时文件；仅当前分段存在内存，提交后清零 PCM 并释放引用，等待识别结果时不保留音频。没有需要后续清理的完整媒体文件。

标准接口为 `https://openspeech.bytedance.com/api/v3/auc/bigmodel/{submit,query}`；`X-Api-Key` 来自服务器既有密钥配置，默认 `DOUBAO_ASR_RESOURCE_ID=volc.seedasr.auc`。每段在数据库记录 request ID、资源 ID 和预算预留后才发起提交；查询携带同一 ID、请求体 `{}`。中断、超时或进程接管后查询原任务，不自动重新提交。未知提交结果或明确失败会保留记录并停止后续收费步骤；无法查询的原任务需要维护人员核对，不能盲目重新识别。

官方标准接口文档仅说明提交与查询，未列出可确认的取消接口：[录音文件识别标准版 HTTP](https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-recognition-standard-version-api?lang=zh)。因此本功能不承诺撤销云端已经接受的音频或返还费用。

## 中止、重启和预算

- 中止只取消当前用户的请求。有其他有效请求时继续共享处理；最后一个请求中止后立即在数据库撤销运行状态/租约，后台每秒检查并中止 FFmpeg、网络请求和轮询。已提交或已进入提交边界的当前分段最多一分钟，仍可能由云端处理/计费，后续分段不再提交。已完成文本保留，后来可下载或继续。
- 刷新或关网页不会取消一个已创建的回放转录任务；用户要停止费用需点击“中止我的转录请求”。解绑或更换 ZJU 账号会取消该账号未完成的回放请求，保留其他请求及共享文本。
- 共享 worker 与直播共用全局并发锁，默认同时处理两节课。回放使用 30 秒租约，每秒续租和检查取消；generation 与事务检查阻止旧进程写入。服务退出时中止两类 worker，重启会接管未完成请求。已经提交的分段只查询，不再付费重提交。
- 直播与回放共用 `ZjuLiveSubtitleDailyUsage.audioMs`，使用同一事务级锁按北京时间每日原子预留，默认每天总计 120 分钟。失败或不确定提交不自动退回预留，这是止损用的保守估计，并非火山引擎账单。
- `User.asrQuotaExempt` 是只可通过服务器操作设置的账户级豁免，不取决于浏览器参数或可修改的显示名。豁免用户的请求在场时，该课节后续用量计入 `exemptAudioMs`，不消耗普通用户池，直播的单课节时长配额也豁免。并发、内存和分段大小限制继续有效。豁免者退出/中止后，后续分段恢复普通预算。

## 部署

1. 应用迁移 `0013_replay_transcripts`、`0014_replay_chunk_context`，生成 Prisma client，构建网页。
2. 确认服务用户可以读取既有密钥文件，且该 Key 获得 `volc.seedasr.auc` 资源权限；直播资源权限与录音文件权限不能混为一谈。新增可选 `FFPROBE_PATH`。
3. 针对用户指定的唯一现有账户执行 `npm run asr:quota -- --name=hzlgames --unlimited`。脚本先解析唯一账户，再按稳定 user ID 更新豁免字段，不改变其角色。建议后续维护使用 `--user-id=ID`；恢复普通配额用 `--limited`。不在 schema 迁移中按显示名批量授予权限。
4. 更新并重启 `zju-live-subtitles.service`；同一服务现在运行直播和回放 worker。既有字幕清理 timer 仍只清理到期直播记录。回放文本在数据库备份中持久保存，普通工具文件清理不删除它。
5. 主站按当前版本集成，保留 Caddy 的 `/LUMIEREdisplay/*` 分流和独立 LUMIÈRE 服务。

## 验证

基础与隔离数据库回归：

```bash
ZJU_SUBTITLE_DB_TESTS=1 node --import dotenv/config --import tsx --test --test-concurrency=1 tests/zju-subtitles-db.test.ts tests/zju-subtitles.test.ts tests/zju-live.test.ts tests/zju-classroom.test.ts tests/zju-replay-asr.test.ts tests/zju-replay-db.test.ts tests/zju-tools.test.ts
```

数据库必须以 `hakurei_subtitles_regression_` 开头。不同数据库测试文件都包含领取竞争场景，应串行运行，避免彼此领取对方的测试任务。回放验证包括：多用户去重、最后请求取消、直播/回放共享并发、预算不能超支、免配额计数、旧进程写入拦截、接管不重提交，以及解码/云端处理中断后不发送后续段。新增两小时模拟回放，验证连续进度、1.5 秒重叠、上下文传递、单段内存上限和额外预算计数；该测试加速执行，不代表两小时真实运行。

浏览器脚本 `tests/browser/zju-replay.mjs` 需要 `REPLAY_SESSION_FILE` 指向隔离站点的现有用户临时会话，`REPLAY_TEST_URL` 指向预览站点。使用 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH` 指定浏览器运行时。`REPLAY_REAL_API=1` 验证两名用户实际共享排队课节、同用户请求去重、个人取消、跨用户隔离和来源限制；该模式不得启动付费 worker。UI 部分使用明确 fixture 验证两种来源、长期文件、SRT 下载、取消、刷新和桌面/手机明暗主题。

付费短段集成脚本 `tests/integration/zju-replay-asr.ts` 仅在 `RUN_PAID_REPLAY_TEST=1` 和上述隔离库运行，库内需预先准备两个现有用户的加密 ZJU 绑定。默认识别《证据法学》课节回放 70 分钟处的 20 秒，最大允许 180 秒。`REPLAY_TEST_REPORT` 保存不含学校凭据、签名媒体地址或字幕全文的报告。验证片段用独立 validation 缓存身份，不能当作整堂课结果导入生产。

本次实际短段结果：20,014 ms 音频，一次标准版提交，两个现有授权用户的任务均成功，生成 125 字文本和 532 字节 SRT，用时约 11.7 秒。随后校正了重采样尾包的长度，另行验证 60 秒严格等于 1,920,000 字节 PCM。将测试任务创建时间设为 30 天前后，真实下载接口仍可供两个用户各自下载 SRT/TXT；另一个用户的个人任务链接被拒绝。这不代表已验证整堂录播连续转写。

跨段真实验证：同一回放的 130 秒片段，三次提交分别为 58.240、59.810、14.950 秒；后两段各重叠 1.5 秒，总提交 133 秒。两个已有授权用户共享完成结果，生成 850 字文本与 3,527 字节 SRT，用时 42.6 秒。该验证确认新上下文参数被标准接口接受、分段时间连续和共享结果，不是人工字错率评估或整课质量对照。全部 37 项针对性回归通过。

## 2026-11-01 生产发布

- 实现提交 `12be756` 从当前生产 `28fc3d5` 建立独立分支，完成隔离验证后快进集成，未覆盖其他站点改动。生产应用迁移 0013/0014，部署已验证的 webpack 构建并重启主站和字幕 worker；依赖锁文件不变。
- 生产唯一 `hzlgames` 账户已设置 `asrQuotaExempt=true`，其他两账户为 false；已有角色保留，未通过此操作授予后台管理权限。
- 生产浏览器用两名现有授权用户验证课节共享排队、重复请求去重、个人取消、跨用户隔离和跨来源拒绝。验证期间 worker 暂停，排队请求全部取消后恢复，未提交完整课程识别。临时会话和测试请求已删除。页面来源选择、长期下载和刷新行为使用明确 fixture 检查，桌面/手机及明暗主题通过，无浏览器异常。
- 主站和字幕 worker 运行正常，匿名任务接口 401。LUMIÈRE 页面及 CSS/JS 均 200，服务 PID 2403255 未变化；HTML SHA-256 仍为 `2e0d04382116286e26b3d97cdd827f5ef2fc15cd13bc173d2f5e9279b3db0c97`，Caddy 与全部 public 文件保持原样。
- 回滚材料在 `/home/ubuntu/.cache/hakurei-releases/replay-asr-backup/`，包含数据库 dump、原构建及原 worker/Caddy 配置。新增数据库字段和表为增量迁移，回滚旧网页无需删除持久字幕数据。
