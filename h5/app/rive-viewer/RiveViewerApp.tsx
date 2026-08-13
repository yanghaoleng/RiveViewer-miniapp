"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretDown,
  ChatCircleDots,
  DeviceMobile,
  DownloadSimple,
  Gauge,
  Keyboard,
  Pause,
  Play,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  ShareNetwork,
  ArrowCounterClockwise,
  X,
} from "@phosphor-icons/react";
import type {
  CSSProperties,
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  attachLibraryCovers,
  deleteLocalFile,
  formatBytes,
  formatDate,
  getVisibleBuiltinFiles,
  hideBuiltinFile,
  listLocalFiles,
  readLibraryFile,
  saveLocalFile,
  saveLibraryCover,
  type LibraryFile,
} from "../../lib/library";
import {
  WebRivePlayer,
  type RiveInput,
  type RiveMetadata,
  type TimelineProgress,
} from "../../lib/rive-player";

type ActiveFile = {
  file: LibraryFile;
  data: ArrayBuffer;
};

type LoadingState = {
  active: boolean;
  progress: number;
  phase: string;
};

const EMPTY_METADATA: RiveMetadata = {
  artboardNames: [],
  artboardCount: 0,
  artboardCatalogLoaded: false,
  activeArtboard: "",
  stateMachines: [],
  activeStateMachine: "",
  animations: [],
  activeAnimation: "",
  inputs: [],
  width: 0,
  height: 0,
  hasAudio: false,
  audioEnabled: true,
};

const SPEEDS = [0.5, 1, 1.5, 2, 8];
const AUTHOR_WECHAT = "yanghaoeleng";
const CANVAS_TONES = [
  { key: "mist", label: "浅灰" },
  { key: "paper", label: "米白" },
  { key: "white", label: "纯白" },
  { key: "yellow", label: "黄色" },
  { key: "ink", label: "深色" },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00.0";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
}

export function RiveViewerApp() {
  const [files, setFiles] = useState<LibraryFile[]>(getVisibleBuiltinFiles());
  const [expandedFileId, setExpandedFileId] = useState("");
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [metadata, setMetadata] = useState<RiveMetadata>(EMPTY_METADATA);
  const [loading, setLoading] = useState<LoadingState>({
    active: false,
    progress: 0,
    phase: "正在准备文件",
  });
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(true);
  const [timeline, setTimeline] = useState<TimelineProgress>({
    name: "",
    time: 0,
    duration: 0,
    progress: 0,
  });
  const [speed, setSpeed] = useState(1);
  const [fit, setFit] = useState<"contain" | "cover">("cover");
  const [quality, setQuality] = useState(1);
  const [canvasTone, setCanvasTone] = useState("mist");
  const [stageHeight, setStageHeight] = useState(460);
  const [draggingStage, setDraggingStage] = useState(false);
  const [stageResizeMenuActive, setStageResizeMenuActive] = useState(false);
  const [stageResizeTapOpen, setStageResizeTapOpen] = useState(false);
  const [stageResizePressActive, setStageResizePressActive] = useState(false);
  const [stageResizeHoverFit, setStageResizeHoverFit] = useState<"contain" | "cover" | "">("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState(0);
  const [fps, setFps] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<WebRivePlayer | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, height: 0 });
  const draggingStageRef = useRef(false);
  const stageResizeMovedRef = useRef(false);
  const stageResizeStartedOpenRef = useRef(false);
  const stageResizeLongPressTimerRef = useRef<number | null>(null);
  const lastStageTapRef = useRef(0);
  const speedRef = useRef(speed);
  const fitRef = useRef(fit);
  const qualityRef = useRef(quality);
  const capturedCoverIdsRef = useRef(new Set<string>());

  const refreshLibrary = useCallback(async () => {
    try {
      const localFiles = await listLocalFiles();
      const nextFiles = await attachLibraryCovers([...getVisibleBuiltinFiles(), ...localFiles]);
      nextFiles.forEach((file) => {
        if (file.cover) capturedCoverIdsRef.current.add(file.id);
      });
      setFiles(nextFiles);
    } catch (libraryError) {
      console.warn("读取本地文件库失败", libraryError);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => refreshLibrary());
  }, [refreshLibrary]);

  useEffect(() => {
    speedRef.current = speed;
    fitRef.current = fit;
    qualityRef.current = quality;
  }, [fit, quality, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!activeFile || !canvas || !stage) return;
    let cancelled = false;
    const player = new WebRivePlayer(canvas, {
      onMetadata: (nextMetadata) => !cancelled && setMetadata(nextMetadata),
      onPlayback: (nextPlaying) => {
        if (cancelled) return;
        setPlaying(nextPlaying);
      },
      onProgress: (progress) => !cancelled && setTimeline(progress),
      onPerformance: (nextFps) => !cancelled && setFps(nextFps),
    });
    playerRef.current = player;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      player.resize(box.width, box.height);
    });
    observer.observe(stage);

    const load = async () => {
      try {
        setError("");
        setMetadata(EMPTY_METADATA);
        setTimeline({ name: "", time: 0, duration: 0, progress: 0 });
        setLoading({ active: true, progress: 28, phase: "正在初始化 Rive" });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        setLoading({ active: true, progress: 56, phase: "正在解析文件" });
        await player.load(activeFile.data);
        if (cancelled) return;
        player.setSpeed(speedRef.current);
        player.setFit(fitRef.current);
        player.setQuality(qualityRef.current);
        setLoading({ active: true, progress: 94, phase: "正在绘制首帧" });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        setLoading({ active: false, progress: 100, phase: "加载完成" });
        if (!capturedCoverIdsRef.current.has(activeFile.file.id)) {
          capturedCoverIdsRef.current.add(activeFile.file.id);
          window.setTimeout(async () => {
            if (cancelled || !canvas.width || !canvas.height) return;
            const thumbnail = document.createElement("canvas");
            thumbnail.width = 160;
            thumbnail.height = 120;
            const context = thumbnail.getContext("2d", { alpha: false });
            if (!context) return;
            context.fillStyle = "#1b2632";
            context.fillRect(0, 0, thumbnail.width, thumbnail.height);
            context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
            const blob = await new Promise<Blob | null>((resolve) => (
              thumbnail.toBlob(resolve, "image/webp", 0.58)
            ));
            if (!blob || cancelled) return;
            await saveLibraryCover(activeFile.file.id, blob);
            if (!cancelled) await refreshLibrary();
          }, 180);
        }
      } catch (loadError) {
        if (cancelled) return;
        setLoading({ active: false, progress: 0, phase: "加载失败" });
        setError(loadError instanceof Error ? loadError.message : "Rive 文件无法打开");
      }
    };
    load();

    return () => {
      cancelled = true;
      observer.disconnect();
      player.dispose();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [activeFile, refreshLibrary]);

  useEffect(() => {
    playerRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    playerRef.current?.setFit(fit);
  }, [fit]);

  useEffect(() => {
    playerRef.current?.setQuality(quality);
  }, [quality]);

  const activeIndex = useMemo(
    () => files.findIndex((file) => file.id === activeFile?.file.id),
    [activeFile, files],
  );
  const coverUrls = useMemo(() => new Map(
    files
      .filter((file) => file.cover)
      .map((file) => [file.id, URL.createObjectURL(file.cover!)]),
  ), [files]);

  useEffect(() => () => {
    coverUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [coverUrls]);

  useEffect(() => {
    if (!expandedFileId) return;
    const closeFileMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".file-row.is-menu-open")) setExpandedFileId("");
    };
    document.addEventListener("pointerdown", closeFileMenu);
    return () => document.removeEventListener("pointerdown", closeFileMenu);
  }, [expandedFileId]);

  const openFile = useCallback(async (file: LibraryFile) => {
    try {
      setExpandedFileId("");
      setError("");
      setLoading({ active: true, progress: 8, phase: "正在读取本地文件" });
      const data = await readLibraryFile(file);
      setActiveFile({ file: { ...file, size: file.size || data.byteLength }, data });
      setFps(0);
    } catch (openError) {
      setLoading({ active: false, progress: 0, phase: "读取失败" });
      setError(openError instanceof Error ? openError.message : "无法读取文件");
    }
  }, []);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []).filter((file) => (
      file.name.toLowerCase().endsWith(".riv")
    ));
    event.target.value = "";
    if (!selected.length) return;
    setLoading({ active: true, progress: 12, phase: `正在保存 ${selected.length} 个文件` });
    try {
      const saved: LibraryFile[] = [];
      for (const file of selected) saved.push(await saveLocalFile(file));
      await refreshLibrary();
      setLoading({ active: false, progress: 100, phase: "导入完成" });
      if (saved[0]) await openFile(saved[0]);
    } catch (importError) {
      setLoading({ active: false, progress: 0, phase: "导入失败" });
      setError(importError instanceof Error ? importError.message : "文件导入失败");
    }
  };

  const downloadFile = useCallback(async (file: LibraryFile) => {
    const data = await readLibraryFile(file);
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const shareFile = useCallback(async (file: LibraryFile) => {
    const data = await readLibraryFile(file);
    const sharedFile = new File([data], file.name, { type: "application/octet-stream" });
    const payload = { files: [sharedFile], title: file.name };
    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      try {
        await navigator.share(payload);
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }
    await downloadFile(file);
  }, [downloadFile]);

  const removeFile = useCallback(async (file: LibraryFile) => {
    if (file.builtin) hideBuiltinFile(file.id);
    else await deleteLocalFile(file.id);
    setExpandedFileId("");
    if (activeFile?.file.id === file.id) setActiveFile(null);
    await refreshLibrary();
  }, [activeFile?.file.id, refreshLibrary]);

  const togglePlayback = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pause();
    else player.play();
  }, [playing]);

  const navigateFile = useCallback((offset: number) => {
    const next = files[activeIndex + offset];
    if (next) openFile(next);
  }, [activeIndex, files, openFile]);

  const resetPlayback = useCallback(() => {
    playerRef.current?.reset();
  }, []);

  const adjustSpeed = useCallback((offset: number) => {
    setSpeed((current) => {
      const currentIndex = SPEEDS.indexOf(current);
      const nextIndex = clamp(currentIndex + offset, 0, SPEEDS.length - 1);
      return SPEEDS[nextIndex];
    });
  }, []);

  useEffect(() => {
    if (!activeFile) return;
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        target?.isContentEditable
        || tagName === "INPUT"
        || tagName === "TEXTAREA"
        || tagName === "SELECT"
      ) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "escape") {
        event.preventDefault();
        setActiveFile(null);
        return;
      }
      if (key === " " && target?.closest(".shortcut-button")) return;

      if (key === "r") resetPlayback();
      else if (key === " ") togglePlayback();
      else if (key === "arrowleft" || key === "arrowup") navigateFile(-1);
      else if (key === "arrowright" || key === "arrowdown") navigateFile(1);
      else if (key === "+" || key === "=") adjustSpeed(1);
      else if (key === "-" || key === "_") adjustSpeed(-1);
      else return;

      event.preventDefault();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeFile, adjustSpeed, navigateFile, resetPlayback, togglePlayback]);

  const expandCatalog = async () => {
    if (catalogLoading) return;
    setCatalogLoading(true);
    setCatalogProgress(0);
    try {
      await playerRef.current?.loadArtboardCatalog(setCatalogProgress);
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleInput = (input: RiveInput, value?: boolean | number) => {
    if (input.type === "trigger") playerRef.current?.fireInput(input.index);
    else playerRef.current?.setInput(input.index, value ?? !input.value);
  };

  const canvasPointer = (
    type: "down" | "move" | "up" | "exit",
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (type === "down") {
      canvas.setPointerCapture(event.pointerId);
      playerRef.current?.pointer("down", x, y, event.pointerId);
      return;
    }
    if (type === "up") {
      playerRef.current?.pointer("up", x, y, event.pointerId);
      playerRef.current?.pointer("exit", x, y, event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (type === "exit") {
      if (event.type === "pointerleave" && canvas.hasPointerCapture(event.pointerId)) return;
      playerRef.current?.pointer("exit", x, y, event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    playerRef.current?.pointer("move", x, y, event.pointerId);
  };

  const clearStageResizeTimer = () => {
    if (stageResizeLongPressTimerRef.current !== null) {
      window.clearTimeout(stageResizeLongPressTimerRef.current);
      stageResizeLongPressTimerRef.current = null;
    }
  };

  const stageFitAtPointer = (clientX: number): "contain" | "cover" | "" => {
    const bounds = eventTargetStageResizerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return "";
    const ratio = (clientX - bounds.left) / bounds.width;
    if (ratio < 0 || ratio > 1) return "";
    if (ratio < 1 / 3) return "contain";
    if (ratio > 2 / 3) return "cover";
    return "";
  };

  const eventTargetStageResizerRef = useRef<HTMLDivElement>(null);

  const beginStageResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".stage-resizer-mode")) return;
    resizeStartRef.current = { x: event.clientX, y: event.clientY, height: stageHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingStageRef.current = true;
    stageResizeMovedRef.current = false;
    stageResizeStartedOpenRef.current = stageResizeTapOpen;
    setStageResizeMenuActive(true);
    setStageResizeTapOpen(false);
    setStageResizePressActive(false);
    setStageResizeHoverFit("");
    clearStageResizeTimer();
    stageResizeLongPressTimerRef.current = window.setTimeout(() => {
      setStageResizePressActive(true);
    }, 150);
  };

  const moveStageResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingStageRef.current) return;
    const deltaX = event.clientX - resizeStartRef.current.x;
    const deltaY = event.clientY - resizeStartRef.current.y;
    setStageResizeHoverFit(stageFitAtPointer(event.clientX));
    if (Math.abs(deltaY) > 4 || Math.abs(deltaX) > 4) {
      stageResizeMovedRef.current = true;
      setDraggingStage(true);
      setStageResizePressActive(true);
    }
    const maximum = Math.max(320, window.innerHeight * 0.66);
    if (Math.abs(deltaY) >= Math.abs(deltaX)) {
      setStageHeight(clamp(resizeStartRef.current.height + deltaY, 250, maximum));
    }
  };

  const endStageResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingStageRef.current) return;
    clearStageResizeTimer();
    const selectedFit = stageResizeStartedOpenRef.current ? "" : stageFitAtPointer(event.clientX);
    draggingStageRef.current = false;
    setDraggingStage(false);
    setStageResizePressActive(false);
    setStageResizeHoverFit("");
    if ((stageResizeMovedRef.current || selectedFit) && selectedFit) {
      selectFit(selectedFit);
      setStageResizeMenuActive(false);
      setStageResizeTapOpen(false);
      return;
    }
    if (stageResizeMovedRef.current) {
      setStageResizeMenuActive(false);
      setStageResizeTapOpen(false);
      return;
    }
    setStageResizeMenuActive(true);
    setStageResizeTapOpen(true);
  };

  const selectFit = (nextFit: "contain" | "cover") => {
    setFit(nextFit);
    playerRef.current?.setFit(nextFit);
  };

  const toggleStageHeight = () => {
    const compact = Math.max(270, window.innerHeight * 0.35);
    const expanded = Math.max(400, window.innerHeight * 0.58);
    setStageHeight(stageHeight > (compact + expanded) / 2 ? compact : expanded);
  };

  const handleStageTap = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (stageResizeMovedRef.current) {
      stageResizeMovedRef.current = false;
      lastStageTapRef.current = 0;
      return;
    }
    if (event.detail === 0) {
      toggleStageHeight();
      setStageResizeMenuActive(false);
      setStageResizeTapOpen(false);
      return;
    }
    const now = performance.now();
    if (now - lastStageTapRef.current <= 320) {
      lastStageTapRef.current = 0;
      toggleStageHeight();
      setStageResizeMenuActive(false);
      setStageResizeTapOpen(false);
      return;
    }
    lastStageTapRef.current = now;
  };

  const remainingArtboards = Math.max(0, metadata.artboardCount - metadata.artboardNames.length);
  const hasStageAspect = metadata.width > 0 && metadata.height > 0;
  const stageAspect = hasStageAspect ? metadata.width / metadata.height : 1;
  const stageStyle = fit === "contain" && hasStageAspect
    ? {
        width: `min(100%, ${Math.round(stageHeight * stageAspect)}px)`,
        aspectRatio: `${metadata.width} / ${metadata.height}`,
      }
    : { width: "100%", height: `${stageHeight}px` };
  const timelineStyle = {
    "--timeline-progress": `${Math.round(timeline.progress * 100)}%`,
  } as CSSProperties;

  return (
    <main className={`app-shell ${activeFile ? "preview-shell" : ""}`}>
      {activeFile ? (
        <>
          <header className="topbar preview-topbar">
            <button
              className="topbar-back"
              onClick={() => setActiveFile(null)}
              aria-label="关闭当前文件"
              aria-keyshortcuts="Escape"
              title="关闭当前文件 (Esc)"
            >
              <X size={21} weight="bold" />
            </button>
            <Brand label="Rive 预览" />
            <div className="topbar-actions preview-actions">
              <button className="topbar-download" onClick={() => downloadFile(activeFile.file)}>
                <DownloadSimple size={18} />下载
              </button>
              <ShortcutHelp />
            </div>
          </header>
          <header className="topbar drawer-home-topbar">
            <Brand label="Rive 预览台" />
            <div className="topbar-actions">
              <ShortcutHelp />
            </div>
          </header>
        </>
      ) : (
        <header className="topbar">
          <Brand label="Rive 预览台" />
          <div className="topbar-actions">
            <ShortcutHelp />
          </div>
        </header>
      )}

      <div className={`drawer-workspace ${activeFile ? "is-open" : ""}`}>
        <div className="drawer-home-pane">
          <section className="library-page">
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".riv,application/octet-stream"
              multiple
              onChange={importFiles}
            />
            <button className="import-dropzone press-feedback-large" onClick={() => fileInputRef.current?.click()}>
              <span className="import-mark"><Plus size={24} weight="bold" /></span>
              <span>导入 Rive 文件</span>
            </button>

            {error && !activeFile && <div className="inline-error">{error}</div>}

            <div className="section-heading">
              <h1>最近文件</h1>
              <span>{files.length} 个</span>
            </div>
            <LibraryList
              files={files}
              coverUrls={coverUrls}
              expandedFileId={expandedFileId}
              activeFileId={activeFile?.file.id}
              onOpen={openFile}
              onShare={shareFile}
              onRemove={removeFile}
              onToggleMenu={(id) => setExpandedFileId(expandedFileId === id ? "" : id)}
            />
            <MiniProgramEntry />
            <FeedbackContact />
          </section>
        </div>

      {activeFile && <section className="preview-page drawer-preview-panel">
        <div className="file-heading">
          <button
            className="drawer-close"
            onClick={() => setActiveFile(null)}
            aria-label="关闭当前文件"
            aria-keyshortcuts="Escape"
            title="关闭当前文件 (Esc)"
          >
            <X size={21} weight="bold" />
          </button>
          <div className="file-heading-copy">
            <h1>{activeFile.file.name}</h1>
            <div className="file-heading-meta">
              <span>{formatBytes(activeFile.file.size)}</span>
              {metadata.width > 0 && <span>{Math.round(metadata.width)} × {Math.round(metadata.height)}</span>}
              <span className="timecode">{formatTime(timeline.time)} / {formatTime(timeline.duration)}</span>
              <span className="file-fps">{fps || "--"} FPS</span>
            </div>
          </div>
          <button
            className="file-heading-download press-feedback"
            onClick={() => downloadFile(activeFile.file)}
            aria-label="下载当前文件"
          >
            <DownloadSimple size={18} />
          </button>
        </div>

        <div
          ref={stageRef}
          className={`canvas-card tone-${canvasTone} ${fit === "contain" && hasStageAspect ? "is-proportional" : ""}`}
          style={stageStyle}
        >
          <canvas
            ref={canvasRef}
            aria-label="Rive 交互画布"
            onPointerDown={(event) => canvasPointer("down", event)}
            onPointerMove={(event) => canvasPointer("move", event)}
            onPointerUp={(event) => canvasPointer("up", event)}
            onPointerCancel={(event) => canvasPointer("exit", event)}
            onPointerLeave={(event) => canvasPointer("exit", event)}
          />
          {loading.active && (
            <div className="canvas-state loading-state">
              <div className="loading-ring">
                <span>{loading.progress}%</span>
              </div>
              <p>{loading.phase}</p>
              <div className="loading-track"><i style={{ width: `${loading.progress}%` }} /></div>
            </div>
          )}
          {error && (
            <div className="canvas-state error-state">
              <strong>Rive 文件未能加载</strong>
              <p>{error}</p>
              <button onClick={() => openFile(activeFile.file)}>重新加载</button>
            </div>
          )}
        </div>

        <div
          ref={eventTargetStageResizerRef}
          className={`stage-resizer ${draggingStage ? "is-dragging" : ""} ${stageResizeMenuActive ? "is-selecting" : ""} ${stageResizeTapOpen ? "is-tap-open" : ""} ${stageResizePressActive ? "is-press-active" : ""}`}
          onPointerDown={beginStageResize}
          onPointerMove={moveStageResize}
          onPointerUp={endStageResize}
          onPointerCancel={endStageResize}
          onClick={handleStageTap}
          role="slider"
          tabIndex={0}
          aria-label="单击展开完整或铺满，上下拖动画布高度，按住后左右滑动选择，双击切换高度"
          aria-valuemin={250}
          aria-valuemax={Math.round(Math.max(320, typeof window === "undefined" ? 620 : window.innerHeight * 0.66))}
          aria-valuenow={Math.round(stageHeight)}
        >
          <span className="stage-resizer-grip" />
          {stageResizeMenuActive && (
            <div className="stage-resizer-modes">
              <button
                className={`stage-resizer-mode mode-contain ${fit === "contain" ? "is-current" : ""} ${stageResizeHoverFit === "contain" ? "is-hovered" : ""}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); selectFit("contain"); setStageResizeMenuActive(false); setStageResizeTapOpen(false); }}
              >
                <ArrowsInSimple size={18} weight="bold" /><span>完整</span>
              </button>
              <button
                className={`stage-resizer-mode mode-cover ${fit === "cover" ? "is-current" : ""} ${stageResizeHoverFit === "cover" ? "is-hovered" : ""}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); selectFit("cover"); setStageResizeMenuActive(false); setStageResizeTapOpen(false); }}
              >
                <ArrowsOutSimple size={18} weight="bold" /><span>铺满</span>
              </button>
            </div>
          )}
        </div>

        <div className="transport">
          <div className="transport-playback">
            <button className="icon-button press-feedback" onClick={resetPlayback} aria-label="重播" aria-keyshortcuts="R" title="重播 (R)">
              <ArrowCounterClockwise size={20} />
            </button>
            <button className="icon-button press-feedback" onClick={togglePlayback} aria-label={playing ? "暂停" : "播放"} aria-keyshortcuts="Space" title={`${playing ? "暂停" : "播放"} (空格)`}>
              {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
            </button>
          </div>
          <label className="speed-select">
            <Gauge size={18} weight="bold" />
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-keyshortcuts="+ -" title="调整播放速度 (+ / -)">
              {SPEEDS.map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
          <div className="transport-files">
            <button className="press-feedback" disabled={activeIndex <= 0} onClick={() => navigateFile(-1)} aria-label="上一个文件" aria-keyshortcuts="ArrowLeft ArrowUp" title="上一个文件 (← / ↑)">
              <ArrowLeft size={18} />
            </button>
            <button className="press-feedback" disabled={activeIndex < 0 || activeIndex >= files.length - 1} onClick={() => navigateFile(1)} aria-label="下一个文件" aria-keyshortcuts="ArrowRight ArrowDown" title="下一个文件 (→ / ↓)">
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        <div className="control-panel">
          <ParameterRow label="画板">
            {metadata.artboardNames.map((name) => (
              <Tag key={name} selected={metadata.activeArtboard === name} onClick={() => playerRef.current?.selectArtboard(name)}>{name}</Tag>
            ))}
            {!metadata.artboardCatalogLoaded && remainingArtboards > 0 && (
              <button className="disclosure-tag" onClick={expandCatalog} disabled={catalogLoading}>
                {catalogLoading && <i style={{ width: `${catalogProgress}%` }} />}
                <span>{catalogLoading ? `正在解析 ${catalogProgress}%` : `展开其余 ${remainingArtboards} 个`}</span>
              </button>
            )}
          </ParameterRow>

          <ParameterRow label="状态机">
            {metadata.stateMachines.length ? metadata.stateMachines.map((name) => (
              <Tag key={name} selected={metadata.activeStateMachine === name} onClick={() => playerRef.current?.selectStateMachine(name)}>{name}</Tag>
            )) : <EmptyTag>无状态机</EmptyTag>}
          </ParameterRow>

          <ParameterRow label="时间轴">
            {metadata.animations.length ? metadata.animations.map((name) => (
              <Tag
                key={name}
                selected={metadata.activeAnimation === name}
                active={playing && metadata.activeAnimation === name}
                style={metadata.activeAnimation === name ? timelineStyle : undefined}
                onClick={() => playerRef.current?.selectAnimation(name)}
              >{name}</Tag>
            )) : <EmptyTag>无时间轴</EmptyTag>}
          </ParameterRow>

          <ParameterRow label="状态机输入">
            {metadata.inputs.length ? metadata.inputs.map((input) => (
              input.type === "number" ? (
                <label className="number-tag" key={`${input.name}-${input.index}`}>
                  <span>{input.name}</span>
                  <input
                    aria-label={`${input.name} 数值`}
                    type="number"
                    step="0.1"
                    value={Number(input.value || 0)}
                    onChange={(event) => handleInput(input, Number(event.target.value))}
                  />
                </label>
              ) : (
                <Tag
                  key={`${input.name}-${input.index}`}
                  selected={input.type === "boolean" && Boolean(input.value)}
                  onClick={() => handleInput(input)}
                >
                  {input.name}{input.type === "boolean" ? ` ${input.value ? "开" : "关"}` : ""}
                </Tag>
              )
            )) : <EmptyTag>无输入</EmptyTag>}
          </ParameterRow>

          <ParameterRow label="预览背景">
            {CANVAS_TONES.map((tone) => (
              <button
                key={tone.key}
                className={`tone-button press-feedback tone-${tone.key} ${canvasTone === tone.key ? "is-active" : ""}`}
                aria-label={`${tone.label}背景`}
                aria-pressed={canvasTone === tone.key}
                onClick={() => setCanvasTone(tone.key)}
              />
            ))}
          </ParameterRow>

          {metadata.hasAudio && (
            <ParameterRow label="声音">
              <Tag
                selected={metadata.audioEnabled}
                onClick={() => playerRef.current?.setAudioEnabled(!metadata.audioEnabled)}
              >
                {metadata.audioEnabled ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}
                {metadata.audioEnabled ? "开启" : "静音"}
              </Tag>
            </ParameterRow>
          )}

          <ParameterRow label="渲染质量">
            <Tag selected={quality === 1} onClick={() => setQuality(1)}>性能</Tag>
            <Tag selected={quality === 1.5} onClick={() => setQuality(1.5)}>平衡</Tag>
            <Tag selected={quality === 2} onClick={() => setQuality(2)}>高清</Tag>
          </ParameterRow>
          <ParameterRow label="缩放方式">
            <Tag selected={fit === "contain"} onClick={() => selectFit("contain")}>完整</Tag>
            <Tag selected={fit === "cover"} onClick={() => selectFit("cover")}>铺满</Tag>
          </ParameterRow>
        </div>

      </section>}
      </div>
    </main>
  );
}

function Brand({ label }: { label: string }) {
  return (
    <div className="brand">
      {/* 与浏览器页签复用同一份本地图标，避免品牌图形分叉。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/rive-viewer/favicon.webp?v=2" alt="" />
      <span>{label}</span>
    </div>
  );
}

function FeedbackContact() {
  const [notice, setNotice] = useState("");
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2200);
  };

  const copyWechat = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(AUTHOR_WECHAT);
      } else {
        const input = document.createElement("textarea");
        input.value = AUTHOR_WECHAT;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("浏览器未允许复制");
      }
      showNotice("微信号已复制");
    } catch {
      showNotice(`复制失败，微信号：${AUTHOR_WECHAT}`);
    }
  };

  return (
    <div className="feedback-contact">
      <button
        className="author-contact press-feedback"
        type="button"
        onClick={copyWechat}
        aria-label="联系作者反馈意见，复制微信号"
      >
        <ChatCircleDots size={16} />
        <span>联系作者反馈意见</span>
      </button>
      {notice && <div className="feedback-notice" role="status" aria-live="polite">{notice}</div>}
    </div>
  );
}

function MiniProgramEntry() {
  const [open, setOpen] = useState(false);
  const entryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (entryRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      entryRef.current?.querySelector("button")?.blur();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div
      ref={entryRef}
      className={`mini-program-entry ${open ? "is-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        setOpen(false);
        (event.currentTarget.querySelector("button") as HTMLButtonElement | null)?.blur();
      }}
    >
      <button
        className="mini-program-trigger press-feedback"
        aria-expanded={open}
        aria-controls="mini-program-card"
        onClick={() => setOpen((current) => !current)}
      >
        <DeviceMobile size={17} weight="bold" />
        <span>使用小程序版</span>
      </button>
      <div id="mini-program-card" className="mini-program-popover" role="group" aria-label="Rive 预览台小程序码">
        <strong>Rive 预览台</strong>
        <span>微信扫码打开小程序</span>
        {/* 小程序码由杨总提供，转为本地 WebP 后随静态站点发布。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rive-viewer/mini-program-code.webp" alt="Rive 预览台小程序码" />
      </div>
    </div>
  );
}

function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="shortcut-help">
      <button
        className={`shortcut-button ${open ? "is-active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label="查看快捷键"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="查看快捷键"
      >
        <Keyboard size={19} weight="bold" />
      </button>
      {open && (
        <div className="shortcut-popover" role="dialog" aria-label="快捷键说明">
          <strong>快捷键</strong>
          <div><span>重播</span><kbd>R</kbd></div>
          <div><span>播放 / 暂停</span><kbd>空格</kbd></div>
          <div><span>上一个文件</span><span className="key-group"><kbd>↑</kbd><kbd>←</kbd></span></div>
          <div><span>下一个文件</span><span className="key-group"><kbd>↓</kbd><kbd>→</kbd></span></div>
          <div><span>播放速度</span><span className="key-group"><kbd>-</kbd><kbd>+</kbd></span></div>
          <div><span>关闭文件</span><kbd>Esc</kbd></div>
        </div>
      )}
    </div>
  );
}

function ParameterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="parameter-row">
      <span className="parameter-label">{label}</span>
      <div className="parameter-actions">{children}</div>
    </div>
  );
}

function Tag({
  selected,
  active,
  children,
  style,
  onClick,
}: {
  selected?: boolean;
  active?: boolean;
  children: React.ReactNode;
  style?: CSSProperties;
  onClick: () => void;
}) {
  return (
    <button
      className={`parameter-tag press-feedback ${selected ? "is-selected" : ""} ${active ? "is-playing" : ""}`}
      style={style}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span>{children}</span>
    </button>
  );
}

function EmptyTag({ children }: { children: React.ReactNode }) {
  return <span className="empty-tag">{children}</span>;
}

function LibraryList({
  files,
  coverUrls,
  expandedFileId,
  activeFileId,
  compact,
  onOpen,
  onShare,
  onRemove,
  onToggleMenu,
}: {
  files: LibraryFile[];
  coverUrls: Map<string, string>;
  expandedFileId: string;
  activeFileId?: string;
  compact?: boolean;
  onOpen: (file: LibraryFile) => void;
  onShare: (file: LibraryFile) => void;
  onRemove: (file: LibraryFile) => void;
  onToggleMenu: (id: string) => void;
}) {
  return (
    <div className={`file-list ${compact ? "is-compact" : ""}`}>
      {files.map((file) => (
        <article className={`file-row ${activeFileId === file.id ? "is-current" : ""} ${expandedFileId === file.id ? "is-menu-open" : ""}`} key={file.id}>
          <button className="file-open press-feedback-large" onClick={() => onOpen(file)}>
            <span className={`file-cover ${coverUrls.has(file.id) ? "has-image" : ""}`} aria-hidden="true">
              {coverUrls.has(file.id)
                ? <LocalCoverImage src={coverUrls.get(file.id)!} />
                : "RIV"}
            </span>
            <span className="file-copy">
              <span className="file-title-line">
                <strong>{file.name}</strong>
                {file.builtin && <span className="file-badge">示例</span>}
              </span>
              {!compact && <span>{file.builtin ? "内置测试文件" : "本机导入文件"}</span>}
              <small>{formatBytes(file.size)} / {formatDate(file.updatedAt)}</small>
            </span>
          </button>
          <div className="file-action">
            <button
              className={`square-button press-feedback ${expandedFileId === file.id ? "is-active" : ""}`}
              aria-label={`操作 ${file.name}`}
              onClick={() => onToggleMenu(file.id)}
            >
              <CaretDown size={18} weight="bold" />
            </button>
          </div>
          {expandedFileId === file.id && (
            <div className="file-menu">
              <button className="press-feedback" onClick={() => onShare(file)}><ShareNetwork size={17} />发送文件</button>
              <button className="danger press-feedback" onClick={() => onRemove(file)}>
                <Trash size={17} />删除文件
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function LocalCoverImage({ src }: { src: string }) {
  // Blob 地址完全在本机生成，不能交给远程图片优化服务处理。
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" />;
}
