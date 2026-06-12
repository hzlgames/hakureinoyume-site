import Link from "next/link";
import { ArrowRight, Boxes, GraduationCap } from "lucide-react";
import { DashboardCard } from "../_components/ui";

export default function ToolsPage() {
  return (
    <section className="page-shell tools-page">
      <div className="intro tools-intro">
        <p className="eyebrow">Tools</p>
        <h1>工具箱</h1>
        <p className="lead">把常用服务放进一个可视化入口，登录后按账号隔离运行。</p>
      </div>

      <div className="tool-hub-grid">
        <Link className="tool-hub-link" href="/tools/ZJU_tools">
          <DashboardCard className="tool-hub-card">
            <div className="tool-hub-icon">
              <GraduationCap size={26} />
            </div>
            <div>
              <p className="eyebrow">ZJU</p>
              <h2>ZJU 工具合集</h2>
              <p>学在浙大待办、成绩、课程资料等网页化工具。</p>
            </div>
            <ArrowRight className="tool-hub-arrow" size={20} />
          </DashboardCard>
        </Link>

        <DashboardCard className="tool-hub-card tool-hub-card-muted">
          <div className="tool-hub-icon">
            <Boxes size={26} />
          </div>
          <div>
            <p className="eyebrow">More</p>
            <h2>更多工具</h2>
            <p>后续工具会在这里继续接入。</p>
          </div>
        </DashboardCard>
      </div>
    </section>
  );
}
