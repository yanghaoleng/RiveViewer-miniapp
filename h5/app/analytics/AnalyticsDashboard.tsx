import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  AnalyticsAuthRequiredError,
  authenticateAnalytics,
  getAnalyticsSummary,
  logoutAnalytics,
  type AnalyticsDimensionRow,
  type AnalyticsSummary,
} from "../../lib/analytics-api";
import "./analytics-dashboard.css";

type Days = 7 | 30 | 90;
type Surface = "all" | "generic" | "jojo" | "beta";
type Format = "all" | "rive" | "lottie" | "pag";
type AccessState = "checking" | "locked" | "unlocked";

const numberFormatter = new Intl.NumberFormat("zh-CN");
const compactFormatter = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const DAY_OPTIONS = [
  { value: 7 as const, label: "近 7 天" },
  { value: 30 as const, label: "近 30 天" },
  { value: 90 as const, label: "全部" },
];
const SURFACE_OPTIONS = [
  { value: "jojo" as const, label: "叫叫正式版" },
  { value: "beta" as const, label: "叫叫测试版" },
  { value: "generic" as const, label: "H5 通用版" },
  { value: "all" as const, label: "全部版本" },
];
const FORMAT_OPTIONS = [
  { value: "all" as const, label: "全部格式" },
  { value: "rive" as const, label: "Rive" },
  { value: "lottie" as const, label: "Lottie" },
  { value: "pag" as const, label: "PAG" },
];

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

function DataSelect<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const focusOption = (index: number) => {
    setActiveIndex(index);
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
  };

  const openMenu = (index = selectedIndex) => {
    setOpen(true);
    focusOption(index);
  };

  const closeMenu = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveOption = (event: KeyboardEvent, direction: number) => {
    event.preventDefault();
    const next = (activeIndex + direction + options.length) % options.length;
    focusOption(next);
  };

  return (
    <div className="data-select" ref={rootRef}>
      <span className="data-select-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="data-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); openMenu(Math.min(options.length - 1, selectedIndex + 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); openMenu(Math.max(0, selectedIndex - 1)); }
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span>{selected.label}</span><i aria-hidden="true" />
      </button>
      {open ? (
        <div className="data-select-menu" id={menuId} role="listbox" aria-label={`${label}选项`}>
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              key={String(option.value)}
              ref={(node) => { optionRefs.current[index] = node; }}
              onClick={() => {
                onChange(option.value);
                closeMenu();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") moveOption(event, 1);
                if (event.key === "ArrowUp") moveOption(event, -1);
                if (event.key === "Home") { event.preventDefault(); focusOption(0); }
                if (event.key === "End") { event.preventDefault(); focusOption(options.length - 1); }
                if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(option.value);
                  closeMenu();
                }
              }}
            >
              <span>{option.label}</span><i aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, note, tone = "default", action }: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "accent" | "risk";
  action?: { label: string; expanded: boolean; onClick: () => void };
}) {
  return (
    <article className={`data-metric data-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      {action ? (
        <button type="button" aria-expanded={action.expanded} aria-controls="data-failed-files" onClick={action.onClick}>
          {action.label}<i aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

function AudiencePeriods({ rows }: { rows: AnalyticsSummary["audiencePeriods"] }) {
  return (
    <div className="data-audience-periods" aria-label="不同周期的独立用户数和访问次数">
      <div className="data-audience-periods-head"><span /><span>近 7 天</span><span>近 30 天</span><span>全部</span></div>
      <div><span>独立用户数</span>{rows.map((row) => <strong key={`visitor-${row.days}`}>{formatNumber(row.visitors)}</strong>)}</div>
      <div><span>访问次数</span>{rows.map((row) => <strong key={`visit-${row.days}`}>{formatNumber(row.visits)}</strong>)}</div>
      <small>“全部”按当前 90 天留存范围统计</small>
    </div>
  );
}

function TrendChart({ rows, audiencePeriods }: {
  rows: AnalyticsSummary["trends"];
  audiencePeriods: AnalyticsSummary["audiencePeriods"];
}) {
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
          <h2>访问趋势</h2>
          <p>按天查看访问次数与成功预览。</p>
        </div>
        <div className="data-chart-legend" aria-label="图例">
          <span className="is-session">访问次数</span>
          <span className="is-preview">成功预览</span>
        </div>
      </div>
      <AudiencePeriods rows={audiencePeriods} />
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

function failedFileUrl(row: AnalyticsSummary["failedFiles"][number]): string {
  return row.surface === "beta"
    ? `https://rive.mikeywa.site/beta/${row.code}`
    : `https://rive.mikeywa.site/${row.code}`;
}

function FailedFilesPanel({ rows, failures }: {
  rows: AnalyticsSummary["failedFiles"];
  failures: number;
}) {
  return (
    <section className="data-failed-files" id="data-failed-files">
      <div className="data-failed-files-heading">
        <div><h2>加载失败文件</h2><p>当前筛选范围共 {formatNumber(failures)} 次失败，仅列出可以直接打开复测的托管文件。</p></div>
      </div>
      {rows.length ? (
        <div className="data-failed-file-list">
          {rows.map((row) => (
            <article key={`${row.surface}-${row.code}`}>
              <div><strong>{row.name}</strong><span>{row.surface === "beta" ? "叫叫测试版" : "叫叫正式版"} / {row.format.toUpperCase()}</span></div>
              <div><span>{row.errorLabel}</span><span>{formatNumber(row.attempts)} 次</span><span>{formatFreshness(row.lastFailedAt)}</span></div>
              <a href={failedFileUrl(row)} target="_blank" rel="noreferrer">打开测试</a>
            </article>
          ))}
        </div>
      ) : <p className="data-failed-files-empty">失败来自本地文件，或发生在新版埋点上线前，暂时没有可直接打开的托管文件。</p>}
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

function LoadingDashboard() {
  return <div className="data-loading" aria-label="正在读取体验数据">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>;
}

function DataAccessGate({ checking, onUnlocked }: {
  checking: boolean;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!checking) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [checking]);

  const replacePassword = useCallback((value: string) => {
    setPassword(value.replace(/\D/g, "").slice(0, 6));
    setError("");
  }, []);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (submitting || password.length !== 6) return;
    setSubmitting(true);
    setError("");
    try {
      await authenticateAnalytics(password);
      setPassword("");
      onUnlocked();
    } catch (value) {
      setPassword("");
      setError(value instanceof Error ? value.message : "验证失败，请重试");
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const pressKey = (key: string) => {
    if (submitting) return;
    if (key === "delete") replacePassword(password.slice(0, -1));
    else if (key === "enter") void submit();
    else replacePassword(`${password}${key}`);
    inputRef.current?.focus();
  };

  return (
    <div className="data-access-page">
      <header className="data-access-brand"><span>Rive 预览台</span><strong>体验数据</strong></header>
      <main className="data-access-main">
        <section className="data-access-card" aria-busy={checking || submitting}>
          <span className="data-access-label">仅限内部访问</span>
          <h1>{checking ? "正在确认访问权限" : "输入访问密码"}</h1>
          <p>{checking ? "正在读取本浏览器的登录状态。" : "无需账号，输入 6 位密码即可进入数据后台。"}</p>
          {checking ? (
            <div className="data-access-checking" role="status"><i /><span>正在验证</span></div>
          ) : (
            <form onSubmit={submit}>
              <div className="data-password-field" onClick={() => inputRef.current?.focus()}>
                <div className="data-password-cells" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span className={index < password.length ? "is-filled" : ""} key={index}>
                      {index < password.length ? "●" : ""}
                    </span>
                  ))}
                </div>
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={6}
                  value={password}
                  onChange={(event) => replacePassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") replacePassword("");
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  aria-label="六位访问密码"
                  aria-describedby={error ? "data-password-error" : "data-password-hint"}
                />
              </div>
              <span id="data-password-hint" className="data-password-hint">支持点击数字键盘，也支持实体键盘、退格和回车</span>
              <div className="data-keypad" aria-label="数字键盘">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
                  <button type="button" key={key} onClick={() => pressKey(key)}>{key}</button>
                ))}
                <button type="button" className="data-keypad-secondary" onClick={() => pressKey("delete")}>删除</button>
                <button type="button" onClick={() => pressKey("0")}>0</button>
                <button type="submit" className="data-keypad-submit" disabled={password.length !== 6 || submitting}>
                  {submitting ? "验证中" : "进入"}
                </button>
              </div>
              <div className="data-password-message" aria-live="polite">
                {error ? <span id="data-password-error">{error}</span> : "登录状态在本浏览器保留 12 小时"}
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [days, setDays] = useState<Days>(30);
  const [surface, setSurface] = useState<Surface>("jojo");
  const [format, setFormat] = useState<Format>("all");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [accessState, setAccessState] = useState<AccessState>("checking");
  const [locking, setLocking] = useState(false);
  const [failedFilesOpen, setFailedFilesOpen] = useState(false);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    document.title = "体验数据 - Rive 预览台";
    const controller = new AbortController();
    getAnalyticsSummary({ days, surface, format, signal: controller.signal })
      .then((value) => {
        setSummary(value);
        setAccessState("unlocked");
        setError("");
      })
      .catch((value) => {
        if (controller.signal.aborted) return;
        if (value instanceof AnalyticsAuthRequiredError) {
          setSummary(null);
          setError("");
          setAccessState("locked");
        } else {
          setAccessState("unlocked");
          setError(value instanceof Error ? value.message : "数据读取失败");
        }
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

  const handleUnlocked = useCallback(() => {
    setAccessState("checking");
    setLoading(true);
    refresh();
  }, [refresh]);

  const lockDashboard = useCallback(async () => {
    if (locking) return;
    setLocking(true);
    try {
      await logoutAnalytics();
      setSummary(null);
      setAccessState("locked");
      setLoading(false);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "锁定失败，请重试");
    } finally {
      setLocking(false);
    }
  }, [locking]);

  const metrics = useMemo(() => summary ? [
    { label: "独立会话", value: formatNumber(summary.kpis.sessions), note: `${days} 天内访问工具的浏览器会话`, tone: "default" as const },
    { label: "成功预览", value: formatNumber(summary.kpis.previews), note: "完成解析并绘制首帧", tone: "accent" as const },
    { label: "预览激活率", value: formatPercent(summary.kpis.activationRate), note: "成功预览会话 / 进入工具会话", tone: "accent" as const },
    {
      label: "加载成功率",
      value: formatPercent(summary.kpis.previewSuccessRate),
      note: "成功首帧 / 全部预览尝试",
      tone: summary.kpis.previewSuccessRate < 0.95 && summary.kpis.sessions ? "risk" as const : "default" as const,
      ...(summary.kpis.previewFailures ? {
        action: {
          label: `查看 ${formatNumber(summary.kpis.previewFailures)} 次失败`,
          expanded: failedFilesOpen,
          onClick: () => setFailedFilesOpen((value) => !value),
        },
      } : {}),
    },
    { label: "P95 首帧时间", value: formatDuration(summary.kpis.p95LoadMs), note: "95% 成功预览不超过该时长", tone: summary.kpis.p95LoadMs > 5000 ? "risk" as const : "default" as const },
    { label: "深度使用率", value: formatPercent(summary.kpis.engagementRate), note: "激活后使用播放或检查控件", tone: "default" as const },
    { label: "错误率", value: formatPercent(summary.kpis.errorRate), note: "上传、预览、评论与版本操作失败", tone: summary.kpis.errorRate > 0.05 ? "risk" as const : "default" as const },
  ] : [], [days, failedFilesOpen, summary]);

  if (accessState !== "unlocked") {
    return <DataAccessGate checking={accessState === "checking"} onUnlocked={handleUnlocked} />;
  }

  return (
    <div className="data-dashboard">
      <header className="data-header">
        <div className="data-brand">
          <span>Rive 预览台</span>
          <strong>体验数据</strong>
        </div>
        <div className="data-filters" aria-label="数据筛选">
          <DataSelect label="周期" value={days} options={DAY_OPTIONS} onChange={setDays} />
          <DataSelect label="版本" value={surface} options={SURFACE_OPTIONS} onChange={setSurface} />
          <DataSelect label="格式" value={format} options={FORMAT_OPTIONS} onChange={setFormat} />
          <button type="button" onClick={refresh} disabled={loading}>刷新数据</button>
          <button type="button" className="data-lock-button" onClick={() => void lockDashboard()} disabled={locking}>
            {locking ? "锁定中" : "锁定后台"}
          </button>
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

            {failedFilesOpen && summary.kpis.previewFailures ? (
              <FailedFilesPanel rows={summary.failedFiles} failures={summary.kpis.previewFailures} />
            ) : null}

            <div className="data-primary-grid">
              <TrendChart rows={summary.trends} audiencePeriods={summary.audiencePeriods} />
              <Funnel rows={summary.funnel} />
            </div>

            <section className="data-panel data-diagnostics">
              <div className="data-panel-heading">
                <div>
                  <h2>访问来源</h2>
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
                <p>只保存随机标识的服务端哈希、粗粒度设备和行为结果。托管文件加载失败时仅保存公开短码，文件名由现有托管目录核验后展示；不保存 IP、完整 User-Agent、文件内容或评论正文。数据保留 90 天，并尊重 DNT 与 GPC。</p>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
