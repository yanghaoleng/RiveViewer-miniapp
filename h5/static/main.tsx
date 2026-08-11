import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { RiveViewerApp } from "../app/rive-viewer/RiveViewerApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("缺少 H5 根节点");
}

createRoot(root).render(<RiveViewerApp />);
