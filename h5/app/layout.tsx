import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rive 预览台 H5",
  description: "在浏览器中本地导入、预览和调试 Rive 文件。",
  icons: {
    icon: [
      { url: "/rive-viewer/favicon-source.png?v=2", type: "image/png", sizes: "100x100" },
      { url: "/rive-viewer/favicon.webp?v=2", type: "image/webp", sizes: "64x64" },
    ],
    shortcut: [{ url: "/rive-viewer/favicon.webp?v=2", type: "image/webp" }],
    apple: [{ url: "/rive-viewer/favicon-source.png?v=2", type: "image/png", sizes: "100x100" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
