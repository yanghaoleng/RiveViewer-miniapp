export type AnalyticsSurface = "generic" | "jojo" | "beta";
export type AnalyticsPage = "home" | "preview";
export type AnalyticsEventName =
  | "page_view"
  | "page_dwell"
  | "file_import"
  | "preview_result"
  | "upload_result"
  | "playback"
  | "control_use"
  | "share_action"
  | "comment_result"
  | "version_upload_result"
  | "performance_sample";

export type AnalyticsProperties = {
  outcome?: "success" | "failure";
  durationMs?: number;
  visibleMs?: number;
  fps?: number;
  count?: number;
  renderer?: "webgl2" | "canvas2d" | "canvas" | "webassembly";
  control?: string;
  action?: string;
  errorCategory?: string;
  sourceType?: string;
  sourceHost?: string;
  utmSource?: string;
  utmCampaign?: string;
  speed?: number;
  quality?: number;
  fit?: "contain" | "cover";
  trigger?: "automatic" | "manual";
  fileCode?: string;
};

type AnalyticsEventInput = {
  name: AnalyticsEventName;
  page: AnalyticsPage;
  format?: "rive" | "lottie" | "pag";
  fileSizeBucket?: string;
  properties?: AnalyticsProperties;
};

type QueuedEvent = AnalyticsEventInput & {
  id: string;
  at: string;
};

const ANALYTICS_VISITOR_KEY = "rive-analytics-visitor-v1";
const ANALYTICS_SESSION_KEY = "rive-analytics-session-v1";
const FLUSH_INTERVAL_MS = 8_000;
const MAX_QUEUE_SIZE = 20;

let started = false;
let disabled = false;
let surface: AnalyticsSurface = "generic";
let endpoint = "/api/v1/analytics/events";
let visitorId = "";
let sessionId = "";
let currentPage: AnalyticsPage = "home";
let queue: QueuedEvent[] = [];
let flushTimer: number | null = null;
let visibleStartedAt = 0;
let visibleDurationMs = 0;
let dwellSent = false;

function randomId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function persistedId(storage: Storage | undefined, key: string, prefix: string): string {
  try {
    const existing = storage?.getItem(key) || "";
    if (/^[0-9A-Za-z-]{16,80}$/.test(existing)) return existing;
    const created = randomId(prefix);
    storage?.setItem(key, created);
    return created;
  } catch {
    return randomId(prefix);
  }
}

export function analyticsSurfaceFromBase(base = import.meta.env.BASE_URL): AnalyticsSurface {
  if (base === "/beta/") return "beta";
  if (base === "/") return "jojo";
  return "generic";
}

export function analyticsFileSizeBucket(bytes: number): string {
  const mebibyte = 1024 * 1024;
  if (bytes < mebibyte) return "under_1m";
  if (bytes < 5 * mebibyte) return "1m_5m";
  if (bytes < 10 * mebibyte) return "5m_10m";
  if (bytes < 30 * mebibyte) return "10m_30m";
  return "30m_64m";
}

export function analyticsErrorCategory(value: unknown): string {
  const candidate = value && typeof value === "object" ? value as { code?: unknown; status?: unknown; message?: unknown } : {};
  const code = String(candidate.code || "").toLowerCase();
  const message = String(candidate.message || value || "").toLowerCase();
  const status = Number(candidate.status);
  if (status === 429 || code.includes("rate")) return "rate_limited";
  if (status === 410 || code.includes("archived")) return "archived";
  if (status >= 500) return "server";
  if (code.includes("timeout") || message.includes("超时") || message.includes("timeout")) return "timeout";
  if (code.includes("network") || message.includes("网络") || message.includes("network")) return "network";
  if (code.includes("too_large") || message.includes("超过") || message.includes("too large")) return "too_large";
  if (code.includes("storage") || message.includes("存储")) return "storage";
  if (code.includes("unsupported") || message.includes("不支持")) return "unsupported";
  if (code.includes("invalid") || message.includes("无效") || message.includes("损坏")) return "invalid_file";
  if (message.includes("webgl") || message.includes("canvas") || message.includes("渲染")) return "renderer";
  return "unknown";
}

function sourceProperties(): AnalyticsProperties {
  const params = new URLSearchParams(window.location.search);
  const utmSource = (params.get("utm_source") || "").slice(0, 64);
  const utmCampaign = (params.get("utm_campaign") || "").slice(0, 64);
  let sourceHost = "";
  try {
    sourceHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
  } catch {
    sourceHost = "";
  }
  const productHosts = new Set(["mikeywa.site", "rive.mikeywa.site"]);
  const searchHosts = /(?:baidu|bing|google|sogou|so\.com|sm\.cn)/i;
  const socialHosts = /(?:weixin|wechat|xiaohongshu|xhslink|douyin|tiktok|weibo|zhihu|dingtalk)/i;
  const sourceType = utmSource
    ? "campaign"
    : !sourceHost
      ? "direct"
      : productHosts.has(sourceHost)
        ? "internal"
        : searchHosts.test(sourceHost)
          ? "search"
          : socialHosts.test(sourceHost)
            ? "social"
            : "referral";
  return {
    sourceType,
    ...(sourceHost ? { sourceHost } : {}),
    ...(utmSource ? { utmSource } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
  };
}

function scheduleFlush(): void {
  if (disabled || flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, FLUSH_INTERVAL_MS);
}

export async function flushAnalytics(useBeacon = false): Promise<void> {
  if (disabled || !queue.length) return;
  const events = queue.splice(0, MAX_QUEUE_SIZE);
  const payload = JSON.stringify({ version: 1, surface, visitorId, sessionId, events });
  try {
    if (useBeacon && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
      if (sent) return;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: payload,
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    });
    if (!response.ok && response.status >= 500) queue.unshift(...events);
  } catch {
    // 统计失败不能影响文件预览；只保留当前页面内的有界重试队列。
    queue.unshift(...events);
  }
  if (queue.length > MAX_QUEUE_SIZE) queue = queue.slice(-MAX_QUEUE_SIZE);
  if (queue.length) scheduleFlush();
}

export function trackAnalytics(input: AnalyticsEventInput): void {
  if (!started || disabled) return;
  queue.push({ ...input, id: randomId("event"), at: new Date().toISOString() });
  if (queue.length >= 8) void flushAnalytics();
  else scheduleFlush();
}

export function setAnalyticsPage(page: AnalyticsPage): void {
  currentPage = page;
}

function finishVisiblePeriod(): void {
  if (!visibleStartedAt) return;
  visibleDurationMs += Math.max(0, performance.now() - visibleStartedAt);
  visibleStartedAt = 0;
}

function sendDwell(): void {
  if (dwellSent) return;
  finishVisiblePeriod();
  dwellSent = true;
  trackAnalytics({
    name: "page_dwell",
    page: currentPage,
    properties: { visibleMs: Math.round(visibleDurationMs) },
  });
  void flushAnalytics(true);
}

export function startAnalytics({ page }: { page: AnalyticsPage }): void {
  if (started || typeof window === "undefined") return;
  started = true;
  currentPage = page;
  disabled = window.location.pathname.startsWith("/data")
    || navigator.doNotTrack === "1"
    || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  if (disabled) return;
  surface = analyticsSurfaceFromBase();
  endpoint = surface === "generic" && !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "https://rive.mikeywa.site/api/v1/analytics/events"
    : "/api/v1/analytics/events";
  visitorId = persistedId(window.localStorage, ANALYTICS_VISITOR_KEY, "visitor");
  sessionId = persistedId(window.sessionStorage, ANALYTICS_SESSION_KEY, "session");
  visibleStartedAt = document.visibilityState === "visible" ? performance.now() : 0;
  trackAnalytics({ name: "page_view", page, properties: sourceProperties() });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (!visibleStartedAt) visibleStartedAt = performance.now();
      return;
    }
    finishVisiblePeriod();
    void flushAnalytics(true);
  });
  window.addEventListener("pagehide", sendDwell, { once: true });
}
