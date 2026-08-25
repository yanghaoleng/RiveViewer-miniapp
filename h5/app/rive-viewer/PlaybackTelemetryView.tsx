import { memo, useSyncExternalStore } from "react";
import { formatPlaybackTime, type PlaybackTelemetry } from "../../lib/playback-telemetry";

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
  const progress = `${Math.min(1, Math.max(0, timeline.progress)) * 100}%`;

  return (
    <div className="parameter-row">
      <span className="parameter-label">时间轴</span>
      <div className="parameter-actions">
        {animations.length ? animations.map((name) => {
          const selected = activeAnimation === name;
          return (
            <button
              key={name}
              className={`parameter-tag press-feedback timeline-tag ${selected ? "is-selected is-playing" : ""}`}
              aria-pressed={selected}
              onClick={() => onSelect(name)}
            >
              {selected && (
                <i className="timeline-progress" style={{ width: progress }} aria-hidden="true" />
              )}
              <span>{name}</span>
            </button>
          );
        }) : <span className="empty-tag">无时间轴</span>}
      </div>
    </div>
  );
});
