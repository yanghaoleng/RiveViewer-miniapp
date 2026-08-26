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
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`数据读取失败 (${response.status})`);
  const payload = await response.json() as { item?: AnalyticsSummary; error?: { message?: string } };
  if (!payload.item) throw new Error(payload.error?.message || "统计数据格式无效");
  return payload.item;
}
