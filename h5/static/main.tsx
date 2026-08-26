import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { shareCodeFromPath } from "../lib/viewer-route";
import { startAnalytics } from "../lib/analytics";

const root = document.getElementById("root");

if (!root) {
  throw new Error("缺少 H5 根节点");
}

async function bootstrap() {
  if (import.meta.env.BASE_URL === "/data/") {
    const { AnalyticsDashboard } = await import("../app/analytics/AnalyticsDashboard");
    createRoot(root!).render(<AnalyticsDashboard />);
    return;
  }

  const { RiveViewerApp } = await import("../app/rive-viewer/RiveViewerApp");
  const mode = ["/", "/beta/"].includes(import.meta.env.BASE_URL) ? "hosted" : "local";
  const shareCode = mode === "hosted"
    ? shareCodeFromPath(window.location.pathname, import.meta.env.BASE_URL)
    : null;

  startAnalytics({ page: shareCode ? "preview" : "home" });
  createRoot(root!).render(<RiveViewerApp mode={mode} shareCode={shareCode} />);
}

void bootstrap();
