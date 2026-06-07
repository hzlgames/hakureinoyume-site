import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "博麗の梦",
  description: "一个记录学习与生活的小站"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
