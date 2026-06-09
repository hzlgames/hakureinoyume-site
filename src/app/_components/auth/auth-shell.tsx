import Link from "next/link";
import type { ReactNode } from "react";
import { siteName } from "../../site-theme";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
};

export function AuthShell({ children, eyebrow, title, subtitle }: AuthShellProps) {
  return (
    <main className="auth-scene">
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="section-heading auth-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="auth-title">{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
        <Link className="auth-home-link" href="/">
          返回首页
        </Link>
      </section>
      <div className="auth-brand" aria-hidden="true">
        {siteName}
      </div>
    </main>
  );
}
