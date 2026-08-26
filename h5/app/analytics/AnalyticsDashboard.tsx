import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAnalyticsSummary,
  type AnalyticsDimensionRow,
  type AnalyticsSummary,
} from "../../lib/analytics-api";
import "./analytics-dashboard.css";

type Days = 7 | 30 | 90;
type Surface = "all" | "generic" | "jojo" | "beta";
type Format = "all" | "rive" | "lottie" | "pag";

const numberFormatter = new Intl.NumberFormat("zh-CN");
const compactFormatter = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

function formatNumber(value: number): string {
  return value >= 10_000 ? compactFormatter.format(value) : numberFormatter.format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function formatDuration(value: number): string {
  if (!value) return "暂无";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatFreshness(value: string | null): string {
  if (!value) return "等待第一批真实访问";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function MetricCard({ label, value, note, tone = "default" }: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "accent" | "risk";
}) {
  return (
    <article className={`data-metric data-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function TrendChart({ rows }: { rows: AnalyticsSummary["trends"] }) {
  const width = 720;
  const height = 220;
  const pad = 22;
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.sessions, row.previews]));
  const points = (key: "sessions" | "previews") => rows.map((row, index) => {
    const x = rows.length <= 1 ? width / 2 : pad + (index / (rows.length - 1)) * (width - pad * 2);
    const y = height - pad - (row[key] / maximum) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const labelStep = rows.length > 14 ? 7 : rows.length > 7 ? 3 : 1;

  return (
    <section className="data-panel data-trend-panel">
      <div className="data-panel-heading">
        <div>
          <h2>访问与成功预览趋势</h2>
          <p>会话上升但成功预览不跟随时，优先检查导入和首帧链路。</p>
        </div>
        <div className="data-chart-legend" aria-label="图例">
          <span className="is-session">会话</span>
          <span className="is-preview">成功预览</span>
        </div>
      </div>
      <div className="data-chart-wrap">
        <svg className="data-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="trend-title trend-desc">
          <title id="trend-title">每日访问与成功预览趋势</title>
          <desc id="trend-desc">比较每日独立会话和成功看到首帧的次数。</desc>
          {[0, 0.5, 1].map((ratio) => (
            <line key={ratio} x1={pad} x2={width - pad} y1={pad + ratio * (height - pad * 2)} y2={pad + ratio * (height - pad * 2)} />
          ))}
          <polyline className="data-line-session" points={points("sessions")} />
          <polyline className="data-line-preview" points={points("previews")} />
        </svg>
        <div className="data-date-axis" aria-hidden="true">
          {rows.map((row, index) => (
            index % labelStep === 0 || index === rows.length - 1
              ? <span key={row.date}>{row.date.slice(5).replace("-", "/")}</span>
              : null
          ))}
        </div>
      </div>
      <table className="data-visually-hidden">
        <caption>每日访问与成功预览数据</caption>
        <thead><tr><th>日期</th><th>会话</th><th>成功预览</th><th>错误</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.sessions}</td><td>{row.previews}</td><td>{row.errors}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Funnel({ rows }: { rows: AnalyticsSummary["funnel"] }) {
  const maximum = Math.max(1, rows[0]?.sessions || 0);
  return (
    <section className="data-panel data-funnel-panel">
      <div className="data-panel-heading">
        <div>
          <h2>核心体验漏斗</h2>
          <p>从进入工具到真实协作，定位流失最明显的一步。</p>
        </div>
      </div>
      <ol className="data-funnel">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="data-funnel-copy"><span>{row.label}</span><strong>{formatNumber(row.sessions)}</strong></div>
            <div className="data-funnel-measure" style={{ width: `${Math.max(8, (row.sessions / maximum) * 100)}%` }} />
            <small>{formatPercent(row.rateFromVisit)} 的访问会话</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RankedList({ title, rows, emptyLabel }: {
  title: string;
  rows: AnalyticsDimensionRow[];
  emptyLabel: string;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.events));
  return (
    <section className="data-breakdown">
      <h3>{title}</h3>
      {rows.length ? (
        <ol>
          {rows.slice(0, 7).map((row) => (
            <li key={row.key}>
              <div><span>{row.label}</span><strong>{formatNumber(row.events)}</strong></div>
              <i style={{ width: `${Math.max(2, (row.events / maximum) * 100)}%` }} />
            </li>
          ))}
        </ol>
      ) : <p className="data-empty-inline">{emptyLabel}</p>}
    </section>
  );
}

function SurfaceTable({ rows }: { rows: AnalyticsDimensionRow[] }) {
  return (
    <section className="data-panel data-table-panel">
      <div className="data-panel-heading">
        <div>
          <h2>版本体验对比</h2>
          <p>同一口径比较三套 H5，避免总量掩盖某个版本的故障。</p>
        </div>
      </div>
      <div className="data-table-scroll">
        <table className="data-table">
          <thead><tr><th>版本</th><th>会话</th><th>成功预览</th><th>加载成功率</th><th>P95 首帧</th><th>低帧率</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                <td>{formatNumber(row.sessions)}</td>
                <td>{formatNumber(row.previews || 0)}</td>
                <td>{formatPercent(row.successRate || 0)}</td>
                <td>{formatDuration(row.p95LoadMs || 0)}</td>
                <td>{formatPercent(row.lowFpsRate || 0)}</td>
              </tr>
            )) : <tr><td colSpan={6}>有真实访问后显示版本对比。</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LoadingDashboard() {
  return <div className="data-loading" aria-label="正在读取体验数据">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>;
}

export function AnalyticsDashboard() {
  const [days, setDays] = useState<Days>(30);
  const [surface, setSurface] = useState<Surface>("all");
  const [format, setFormat] = useState<Format>("all");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    document.title = "体验数据 - Rive 预览台";
    const controller = new AbortController();
    getAnalyticsSummary({ days, surface, format, signal: controller.signal })
      .then((value) => {
        setSummary(value);
        setError("");
      })
      .catch((value) => {
        if (!controller.signal.aborted) setError(value instanceof Error ? value.message : "数据读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, format, refreshKey, surface]);

  useEffect(() => {
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const metrics = useMemo(() => summary ? [
    { label: "独立会话", value: formatNumber(summary.kpis.sessions), note: `${days} 天内访问工具的浏览器会话`, tone: "default" as const },
    { label: "成功预览", value: formatNumber(summary.kpis.previews), note: "完成解析并绘制首帧", tone: "accent" as const },
    { label: "预览激活率", value: formatPercent(summary.kpis.activationRate), note: "成功预览会话 / 进入工具会话", tone: "accent" as const },
    { label: "加载成功率", value: formatPercent(summary.kpis.previewSuccessRate), note: "成功首帧 / 全部预览尝试", tone: summary.kpis.previewSuccessRate < 0.95 && summary.kpis.sessions ? "risk" as const : "default" as const },
    { label: "P95 首帧时间", value: formatDuration(summary.kpis.p95LoadMs), note: "95% 成功预览不超过该时长", tone: summary.kpis.p95LoadMs > 5000 ? "risk" as const : "default" as const },
    { label: "深度使用率", value: formatPercent(summary.kpis.engagementRate), note: "激活后使用播放或检查控件", tone: "default" as const },
    { label: "错误率", value: formatPercent(summary.kpis.errorRate), note: "上传、预览、评论与版本操作失败", tone: summary.kpis.errorRate > 0.05 ? "risk" as const : "default" as const },
  ] : [], [days, summary]);

  return (
    <div className="data-dashboard">
      <header className="data-header">
        <div className="data-brand">
          <span>Rive 预览台</span>
          <strong>体验数据</strong>
        </div>
        <div className="data-header-copy">
          <h1>看清用户卡在哪里</h1>
          <p>三个 H5 版本共用一套匿名指标，优先修复首帧、稳定性和关键协作路径。</p>
        </div>
        <div className="data-filters" aria-label="数据筛选">
          <label>周期<select value={days} onChange={(event) => setDays(Number(event.target.value) as Days)}><option value={7}>近 7 天</option><option value={30}>近 30 天</option><option value={90}>近 90 天</option></select></label>
          <label>版本<select value={surface} onChange={(event) => setSurface(event.target.value as Surface)}><option value="all">全部版本</option><option value="generic">H5 通用版</option><option value="jojo">叫叫正式版</option><option value="beta">叫叫测试版</option></select></label>
          <label>格式<select value={format} onChange={(event) => setFormat(event.target.value as Format)}><option value="all">全部格式</option><option value="rive">Rive</option><option value="lottie">Lottie</option><option value="pag">PAG</option></select></label>
          <button type="button" onClick={refresh} disabled={loading}>刷新数据</button>
        </div>
      </header>

      <main className="data-main">
        <div className="data-freshness" role="status">
          <span>数据截至 {formatFreshness(summary?.freshness.latestEventAt || null)}</span>
          <span>{summary ? `${formatNumber(summary.freshness.eventCount)} 条匿名事件` : "正在连接数据源"}</span>
          {summary ? <span>复访率 {formatPercent(summary.kpis.returningVisitorRate)}</span> : null}
          {summary ? <span>平均可见 {formatDuration(summary.kpis.averageVisibleSeconds * 1000)}</span> : null}
          <span>每 60 秒自动刷新</span>
        </div>

        {loading && !summary ? <LoadingDashboard /> : null}
        {error ? (
          <section className="data-error" role="alert">
            <strong>数据暂时没有读出来</strong>
            <p>{error}</p>
            <button type="button" onClick={refresh}>重新读取</button>
          </section>
        ) : null}

        {summary ? (
          <>
            {!summary.freshness.eventCount ? (
              <section className="data-empty-state">
                <strong>埋点已经开始工作，正在等待真实访问</strong>
                <p>部署后的新访问会自动进入这里。后台不会用演示数据填充指标。</p>
              </section>
            ) : null}

            <section className="data-metric-grid" aria-label="核心指标">
              {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </section>

            <div className="data-primary-grid">
              <TrendChart rows={summary.trends} />
              <Funnel rows={summary.funnel} />
            </div>

            <SurfaceTable rows={summary.breakdowns.surfaces} />

            <section className="data-panel data-diagnostics">
              <div className="data-panel-heading">
                <div>
                  <h2>问题从哪个维度发生</h2>
                  <p>先看来源和设备，再对照格式、文件体积、错误与功能使用。</p>
                </div>
              </div>
              <div className="data-breakdown-grid">
                <RankedList title="访问来源" rows={summary.breakdowns.sources} emptyLabel="暂无来源数据" />
                <RankedList title="来源站点" rows={summary.breakdowns.referrers} emptyLabel="暂无外部站点" />
                <RankedList title="活动参数" rows={summary.breakdowns.campaigns} emptyLabel="暂无活动访问" />
                <RankedList title="设备" rows={summary.breakdowns.devices} emptyLabel="暂无设备数据" />
                <RankedList title="浏览器" rows={summary.breakdowns.browsers} emptyLabel="暂无浏览器数据" />
                <RankedList title="操作系统" rows={summary.breakdowns.operatingSystems} emptyLabel="暂无系统数据" />
                <RankedList title="文件格式" rows={summary.breakdowns.formats} emptyLabel="暂无格式数据" />
                <RankedList title="文件体积" rows={summary.breakdowns.sizeBuckets} emptyLabel="暂无体积数据" />
                <RankedList title="高频检查功能" rows={summary.breakdowns.controls} emptyLabel="暂无控件使用数据" />
                <RankedList title="失败原因" rows={summary.breakdowns.errors} emptyLabel="当前筛选范围没有失败" />
              </div>
            </section>

            <section className="data-methodology">
              <div>
                <h2>指标口径</h2>
                <p>激活率看进入工具后是否成功看到首帧；深度使用率看激活后是否使用播放或检查控件；低帧率按采样 FPS 小于 24 计算。</p>
              </div>
              <div>
                <h2>隐私与边界</h2>
                <p>只保存随机标识的服务端哈希、粗粒度设备和行为结果。不保存 IP、完整 User-Agent、文件名、文件内容、分享码或评论正文；保留 90 天，并尊重 DNT 与 GPC。</p>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
