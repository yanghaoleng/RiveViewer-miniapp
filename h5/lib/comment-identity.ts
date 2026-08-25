const COMMENT_VISITOR_STORAGE_KEY = "rive-host-comment-visitor-v1";
const VISITOR_ID_PATTERN = /^[0-9A-Za-z-]{16,80}$/;

let memoryVisitorId = "";

function createVisitorId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2);
  return `visitor-${Date.now().toString(36)}-${randomPart}-${randomPart}`.slice(0, 80);
}

export function getCommentVisitorId(): string {
  if (memoryVisitorId) return memoryVisitorId;
  try {
    const stored = window.localStorage.getItem(COMMENT_VISITOR_STORAGE_KEY) || "";
    if (VISITOR_ID_PATTERN.test(stored)) {
      memoryVisitorId = stored;
      return stored;
    }
  } catch {
    // Safari 隐私模式或受限 WebView 仍在当前页面会话内保持稳定。
  }

  memoryVisitorId = createVisitorId();
  try {
    window.localStorage.setItem(COMMENT_VISITOR_STORAGE_KEY, memoryVisitorId);
  } catch {
    // 持久化失败时使用模块内存值，不读取指纹信息。
  }
  return memoryVisitorId;
}
