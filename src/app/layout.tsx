import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { siteName } from "./site-theme";

export const metadata: Metadata = {
  title: siteName,
  description: "一个用于学习记录、生活整理与个性表达的东方轻二次元个人站。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            {siteName}
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/">首页</Link>
            <Link href="/#study">学习</Link>
            <Link href="/#life">生活</Link>
            <Link href="/tools">工具</Link>
            <Link href="/admin">管理</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
