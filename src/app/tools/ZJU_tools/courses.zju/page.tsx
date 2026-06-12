import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Download,
  FileDown,
  KeyRound,
  ListChecks,
  PlayCircle,
  ShieldCheck
} from "lucide-react";
import { DashboardCard } from "../../../_components/ui";
import { ZjuAuthGate } from "./_components";

const tools = [
  {
    href: "/tools/ZJU_tools/courses.zju/todos",
    icon: <ListChecks size={26} />,
    title: "待办中心",
    tag: "待办",
    body: "汇总学在浙大与 Pintia 待办，按截止时间和来源查看。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/scores",
    icon: <BookOpen size={26} />,
    title: "成绩查询",
    tag: "成绩",
    body: "按课程查询作业和考试分数，查看统计与明细。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/materials",
    icon: <FileDown size={26} />,
    title: "课程资料",
    tag: "资料",
    body: "浏览课程资料，按文件选择并创建可取消的下载任务。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/autoplay",
    icon: <PlayCircle size={26} />,
    title: "自动刷课",
    tag: "刷课",
    body: "按拟真倍速上报观看进度，自动完成视频、页面与资料活动。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/quiz",
    icon: <KeyRound size={26} />,
    title: "测验答案",
    tag: "答案",
    body: "读取学在浙大互动测验参考答案。"
  }
];

export default function CoursesZjuIndexPage() {
  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/courses.zju">
      <section className="page-shell tools-page zju-tool-page">
        <div className="intro tools-intro">
          <p className="eyebrow">学在浙大</p>
          <h1>课程助手</h1>
          <p className="lead">每个工具都有独立页面，便于聚焦处理待办、成绩、资料与刷课。</p>
        </div>

        <div className="zju-tool-index">
          {tools.map((tool, index) => (
            <Link className="tool-hub-link" href={tool.href} key={tool.href} style={{ animationDelay: `${index * 70}ms` }}>
              <DashboardCard className="tool-detail-card tool-launch-card zju-index-card">
                <div className="tool-hub-icon">{tool.icon}</div>
                <div className="zju-index-body">
                  <span className="zju-index-tag">{tool.tag}</span>
                  <h2>{tool.title}</h2>
                  <p>{tool.body}</p>
                </div>
                <ArrowRight className="tool-hub-arrow" size={20} />
              </DashboardCard>
            </Link>
          ))}
        </div>

        <div className="zju-info-grid zju-info-grid-pair">
          <DashboardCard className="tool-detail-card">
            <div className="zju-card-heading">
              <div className="card-title">
                <ShieldCheck size={18} />
                隔离策略
              </div>
            </div>
            <p>每个请求只读取当前网页登录用户自己的 ZJU 凭据，下载与刷课任务也写入用户专属记录。</p>
          </DashboardCard>

          <DashboardCard className="tool-detail-card">
            <div className="zju-card-heading">
              <div className="card-title">
                <Download size={18} />
                任务机制
              </div>
            </div>
            <p>资料下载与自动刷课都会创建后端任务，可实时查看日志、随时取消，并在完成后下载文件。</p>
          </DashboardCard>
        </div>
      </section>
    </ZjuAuthGate>
  );
}
