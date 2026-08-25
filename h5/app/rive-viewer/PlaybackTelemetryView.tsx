import { memo, useMemo, useState, useSyncExternalStore } from "react";
import { formatPlaybackTime, type PlaybackTelemetry } from "../../lib/playback-telemetry";
import { organizeTimelines } from "../../lib/timeline-groups";
import { TimelineHint } from "./TimelineHint";

function useTelemetry(telemetry: PlaybackTelemetry) {
  return useSyncExternalStore(
    telemetry.subscribe,
    telemetry.getSnapshot,
    telemetry.getSnapshot,
  );
}

export const PlaybackMeta = memo(function PlaybackMeta({
  telemetry,
}: {
  telemetry: PlaybackTelemetry;
}) {
  const { timeline, fps } = useTelemetry(telemetry);
  return (
    <>
      <span className="timecode">
        {formatPlaybackTime(timeline.time)} / {formatPlaybackTime(timeline.duration)}
      </span>
      <span className="file-fps">{fps || "--"} FPS</span>
    </>
  );
});

export const TimelineControl = memo(function TimelineControl({
  telemetry,
  animations,
  activeAnimation,
  onSelect,
}: {
  telemetry: PlaybackTelemetry;
  animations: string[];
  activeAnimation: string;
  onSelect: (name: string) => void;
}) {
  const { timeline } = useTelemetry(telemetry);
  const [layout, setLayout] = useState<"expanded" | "organized">("expanded");
  const organizedSections = useMemo(() => organizeTimelines(animations), [animations]);
  const progress = `${Math.min(1, Math.max(0, timeline.progress)) * 100}%`;
  const timelineButton = (name: string, label = name) => {
    const selected = activeAnimation === name;
    return (
      <button
        key={name}
        type="button"
        className={`parameter-tag press-feedback timeline-tag ${selected ? "is-selected is-playing" : ""}`}
        aria-label={`选择时间轴 ${name}`}
        aria-pressed={selected}
        title={label === name ? name : `完整名称：${name}`}
        onClick={() => onSelect(name)}
      >
        {selected && (
          <i className="timeline-progress" style={{ width: progress }} aria-hidden="true" />
        )}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="parameter-row timeline-parameter-row">
      <div className="parameter-label timeline-label">
        <span>时间轴</span>
        <span className="timeline-layout-switch" role="group" aria-label="时间轴显示方式">
          <button
            type="button"
            className={layout === "expanded" ? "is-active" : ""}
            aria-pressed={layout === "expanded"}
            onClick={() => setLayout("expanded")}
          >
            展开
          </button>
          <button
            type="button"
            className={layout === "organized" ? "is-active" : ""}
            aria-pressed={layout === "organized"}
            onClick={() => setLayout("organized")}
          >
            整理
          </button>
        </span>
      </div>
      <div className="parameter-actions timeline-actions">
        {animations.length ? <TimelineHint /> : null}
        {animations.length && layout === "expanded" && (
          <div className="timeline-expanded-list">
            {animations.map((name) => timelineButton(name))}
          </div>
        )}
        {animations.length && layout === "organized" && (
          <div className="timeline-organized-list">
            {organizedSections.map((section) => section.type === "timeline"
              ? timelineButton(section.item.name, section.item.label)
              : (
                <div className="timeline-group" key={`group-${section.prefix}`}>
                  <span className="timeline-group-title">{section.prefix}</span>
                  <div className="timeline-group-tags">
                    {section.items.map((item) => timelineButton(item.name, item.label))}
                  </div>
                </div>
              ))}
          </div>
        )}
        {!animations.length && <span className="empty-tag">无时间轴</span>}
      </div>
    </div>
  );
});
