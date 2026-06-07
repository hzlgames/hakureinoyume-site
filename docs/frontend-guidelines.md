# 前端规范

这份规范按当前项目的实际代码整理，目标是让后续页面保持轻量、统一、可维护。

## 项目边界

- 采用 Next.js App Router，页面入口放在 `src/app/**/page.tsx`。
- 视觉系统以全局 CSS 变量为主，不额外引入 UI 框架。
- 可复用组件放在 `src/app/_components`，只承载稳定的结构和语义，不包太多业务内容。
- 页面级内容可以保留在页面组件里；当同一结构出现 3 次以上，再抽成组件。

## 主题与设计变量

- 颜色优先使用 CSS 变量，不在 JSX 中散落硬编码色值。
- 首页现有变量以 `--bg-color`、`--text-primary`、`--accent`、`--glass-*` 为主。
- `site-theme.ts` 里的 `--theme-*` 变量适合动态背景/后台页面。后续建议逐步收敛到同一套语义变量，再删除过渡变量。
- 新增主题色时必须同时提供背景、正文、弱文本、边框、强调色、玻璃面板、进度条状态。

## 布局规范

- 页面外壳只负责空间关系：顶部固定导航、主内容最大宽度、响应式断点。
- 卡片内容不要直接承担栅格职责；栅格由父级 `.dashboard-grid` 或页面壳处理。
- 移动端优先保证单列可读，避免使用依赖绝对定位才能成立的内容关系。
- 不在页面中继续增加新的大尺寸浮层容器，现有视觉核心是背景图加玻璃面板。

## 组件复用

当前已沉淀的轻量组件：

- `GlassPanel`：复用 `.glass-panel` 的玻璃面板。
- `DashboardCard`：复用 `.glass-panel.p-24` 的仪表盘卡片。
- `CardHeader`：统一卡片标题行、图标、右侧操作。
- `ProgressBar`：统一项目进度条，内部自动限制 0-100。

建议继续抽取但暂不急着做：

- `IconAction`：统一 header、播放器、工具按钮的 hover/focus 语义。
- `MetricCard`：学习时长、天气、统计类卡片。
- `ListRow`：任务、收藏、日记列表的左右布局。
- `ResponsiveHeader`：导航、移动菜单、主题切换可以从首页组件中拆出。

## React/Next 规范

- 优先 Server Component；只有需要状态、事件、浏览器 API 的文件才使用 `"use client"`。
- Client Component 中的 `useEffect` 只处理浏览器副作用，例如主题写入、接口轮询、canvas 绘制。
- 避免在 JSX 中重复写大块结构；稳定模式抽到 `_components`，具体数据留在页面附近。
- 避免无用 import，尤其是图标库 import，保持 bundle 输入干净。
- 内联 `style` 只用于动态值，例如进度百分比、CSS 变量注入；静态视觉放到 CSS。

## CSS 规范

- 全局 CSS 中按顺序放：tokens/reset/base/utilities/layout/components/page-specific/responsive。
- 新 class 名尽量按组件语义命名，不按颜色或临时位置命名。
- 过渡效果只写必要属性，避免长期使用 `transition: all` 扩大副作用。
- 统一使用现有圆角、阴影、玻璃边框，不给每个新卡片发明一套视觉参数。
- 对重复尺寸优先沉淀变量或复用 class，例如卡片 padding、图标尺寸、列表间距。

## 后续清理清单

- 首页和后台目前存在两套变量命名，需要逐步合并。
- `/tools` 使用了 `.page-shell/.intro/.lead`，但当前全局 CSS 没有对应样式，后续应接入同一页面壳。
- `/admin` 使用了 `portal-card/admin-*` 等 class，当前全局 CSS 中没有对应定义，若后台页面要上线，需要补齐或改用现有 primitives。
- 首页 JSX 仍偏长，下一步最值得拆的是 header、任务卡、收藏卡、项目进度卡。
