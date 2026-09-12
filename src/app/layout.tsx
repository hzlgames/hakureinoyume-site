import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "./_components/site-header";

export const metadata: Metadata = {
  title: "博麗の梦",
  description: "一个记录学习与生活的小站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('hakurei-color-mode')==='dark'?'dark':'light'}catch{}`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#site-content">
          跳到页面内容
        </a>
        <SiteHeader />
        <div id="site-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
