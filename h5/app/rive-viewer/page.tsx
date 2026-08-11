import type { Metadata } from "next";
import { RiveViewerApp } from "./RiveViewerApp";

export const metadata: Metadata = {
  title: "Rive 预览台 H5",
  description: "文件只在当前设备保存和解析的 Rive 网页预览工具。",
};

export default function RiveViewerPage() {
  return <RiveViewerApp />;
}
