export type AnalyticsDimensionRow = {
  key: string;
  label: string;
  sessions: number;
  events: number;
  previews?: number;
  successRate?: number;
  p95LoadMs?: number;
  lowFpsRate?: number;
};

export type AnalyticsSummary = {
  window: {
    days: 7 | 30 | 90;
    from: string;
    to: string;
    surface: "all" | "generic" | "jojo" | "beta";
    format: "all" | "rive" | "lottie" | "pag";
  };
  freshness: {
    latestEventAt: string | null;
    eventCount: number;
    retentionDays: number;
    truncated: boolean;
  };
  kpis: {
    sessions: number;
    visitors: number;
    previews: number;
    activationRate: number;
    previewSuccessRate: number;
    p50LoadMs: number;
    p95LoadMs: number;
    engagementRate: number;
    errorRate: number;
    lowFpsRate: number;
    returningVisitorRate: number;
    averageVisibleSeconds: number;
  };
  trends: Array<{
    date: string;
    sessions: number;
    visitors: number;
    previews: number;
    errors: number;
    averageLoadMs: number;
  }>;
  funnel: Array<{
    key: string;
    label: string;
    sessions: number;
    rateFromVisit: number;
  }>;
  breakdowns: {
    surfaces: AnalyticsDimensionRow[];
    formats: AnalyticsDimensionRow[];
    devices: AnalyticsDimensionRow[];
    browsers: AnalyticsDimensionRow[];
    operatingSystems: AnalyticsDimensionRow[];
    sources: AnalyticsDimensionRow[];
    referrers: AnalyticsDimensionRow[];
    campaigns: AnalyticsDimensionRow[];
    controls: AnalyticsDimensionRow[];
    sizeBuckets: AnalyticsDimensionRow[];
    errors: AnalyticsDimensionRow[];
  };
};

export class AnalyticsAuthRequiredError extends Error {
  constructor() {
    super("请先输入数据后台访问密码");
    this.name = "AnalyticsAuthRequiredError";
  }
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

export async function authenticateAnalytics(password: string): Promise<void> {
  const response = await fetch("/api/v1/analytics/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ password }),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response, "验证失败");
}

export async function logoutAnalytics(): Promise<void> {
  const response = await fetch("/api/v1/analytics/logout", {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response, "锁定失败");
}

export async function getAnalyticsSummary({
  days,
  surface,
  format,
  signal,
}: {
  days: 7 | 30 | 90;
  surface: "all" | "generic" | "jojo" | "beta";
  format: "all" | "rive" | "lottie" | "pag";
  signal?: AbortSignal;
}): Promise<AnalyticsSummary> {
  const query = new URLSearchParams({ days: String(days), surface, format });
  const response = await fetch(`/api/v1/analytics/summary?${query}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (response.status === 401) throw new AnalyticsAuthRequiredError();
  if (!response.ok) throw await responseError(response, "数据读取失败");
  const payload = await response.json() as { item?: AnalyticsSummary; error?: { message?: string } };
  if (!payload.item) throw new Error(payload.error?.message || "统计数据格式无效");
  return payload.item;
}
