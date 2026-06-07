import type { CSSProperties, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type CommonProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function GlassPanel({ children, className, style }: CommonProps) {
  return (
    <div className={cx("glass-panel", className)} style={style}>
      {children}
    </div>
  );
}

export function DashboardCard({ children, className, style }: CommonProps) {
  return (
    <GlassPanel className={cx("p-24", className)} style={style}>
      {children}
    </GlassPanel>
  );
}

type CardHeaderProps = {
  action?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
};

export function CardHeader({ action, icon, title }: CardHeaderProps) {
  return (
    <div className="card-header">
      <div className="card-title">
        {icon}
        {title}
      </div>
      {action}
    </div>
  );
}

type ProgressBarProps = {
  value: number;
};

export function ProgressBar({ value }: ProgressBarProps) {
  const boundedValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="project-bar">
      <div className="project-bar-fill" style={{ width: `${boundedValue}%` }} />
    </div>
  );
}
