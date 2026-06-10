import Link from "next/link";
import {
  ArrowRight,
  Ban,
  BookOpen,
  Download,
  FileDown,
  ListChecks,
  ShieldCheck
} from "lucide-react";
import { DashboardCard } from "../../../_components/ui";

const tools = [
  {
    href: "/tools/ZJU_tools/courses.zju/todos",
    icon: <ListChecks size={26} />,
    title: "待办中心",
    eyebrow: "todolist",
    body: "汇总学在浙大与 Pintia 待办，按截止时间和来源查看。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/scores",
    icon: <BookOpen size={26} />,
    title: "成绩查询",
    eyebrow: "scores",
    body: "按课程查询作业和考试分数，查看统计与明细。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/materials",
    icon: <FileDown size={26} />,
    title: "课程资料",
    eyebrow: "materialDown",
    body: "浏览课程资料，按文件选择并创建可取消的下载任务。"
  }
];

export default function CoursesZjuIndexPage() {
  return (
    <section className="page-shell tools-page zju-tool-page">
      <div className="intro tools-intro">
        <p className="eyebrow">courses.zju</p>
        <h1>学在浙大</h1>
        <p className="lead">每个工具都有独立页面，便于聚焦处理待办、成绩和课程资料。</p>
      </div>

      <div className="zju-tool-index">
        {tools.map((tool) => (
          <Link className="tool-hub-link" href={tool.href} key={tool.href}>
            <DashboardCard className="tool-detail-card tool-launch-card zju-index-card">
              <div className="tool-hub-icon">{tool.icon}</div>
              <div>
                <p className="eyebrow">{tool.eyebrow}</p>
                <h2>{tool.title}</h2>
                <p>{tool.body}</p>
              </div>
              <ArrowRight className="tool-hub-arrow" size={20} />
            </DashboardCard>
          </Link>
        ))}
      </div>

      <div className="zju-info-grid">
        <DashboardCard className="tool-detail-card">
          <div className="zju-card-heading">
            <div className="card-title">
              <ShieldCheck size={18} />
              隔离策略
            </div>
          </div>
          <p>每个请求只读取当前网页登录用户自己的 ZJU 凭据，下载任务也写入用户专属目录和任务记录。</p>
        </DashboardCard>

        <DashboardCard className="tool-detail-card">
          <div className="zju-card-heading">
            <div className="card-title">
              <Download size={18} />
              任务机制
            </div>
          </div>
          <p>资料下载会创建后端任务，可在资料页查看日志、取消运行中的任务并下载完成文件。</p>
        </DashboardCard>

        <DashboardCard className="tool-detail-card zju-disabled-card">
          <div className="zju-card-heading">
            <div className="card-title">
              <Ban size={18} />
              未开放网页执行
            </div>
          </div>
          <p>原命令行中的视频完成请求与测验答案读取不会接入网页操作。这里仅保留正常查看和资料下载类工具。</p>
        </DashboardCard>
      </div>
    </section>
  );
}
