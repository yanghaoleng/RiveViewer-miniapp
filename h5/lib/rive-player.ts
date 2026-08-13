import RiveFactory, {
  type Artboard,
  type File as RiveFile,
  type LinearAnimationInstance,
  type Mat2D,
  type RiveCanvas,
  type StateMachineInstance,
  type ViewModelInstance,
  type WrappedRenderer,
} from "@rive-app/canvas-advanced";
import { backingPointToArtboard, canvasPointToBacking } from "./canvas-space";

export type RiveInput = {
  index: number;
  name: string;
  type: "boolean" | "number" | "trigger";
  value: boolean | number | null;
};

export type RiveMetadata = {
  artboardNames: string[];
  artboardCount: number;
  artboardCatalogLoaded: boolean;
  activeArtboard: string;
  stateMachines: string[];
  activeStateMachine: string;
  animations: string[];
  activeAnimation: string;
  inputs: RiveInput[];
  width: number;
  height: number;
  hasAudio: boolean;
  audioEnabled: boolean;
};

export type TimelineProgress = {
  name: string;
  time: number;
  duration: number;
  progress: number;
};

export type PlayerCallbacks = {
  onMetadata: (metadata: RiveMetadata) => void;
  onPlayback: (playing: boolean, label: string) => void;
  onProgress: (progress: TimelineProgress) => void;
  onPerformance: (fps: number) => void;
};

type ArtboardMetadata = {
  name: string;
  width: number;
  height: number;
  animations: string[];
  stateMachines: string[];
};

let runtimePromise: Promise<RiveCanvas> | null = null;

function getRuntime(): Promise<RiveCanvas> {
  if (!runtimePromise) {
    runtimePromise = RiveFactory({
      locateFile: () => "/rive-viewer/rive.wasm",
    }).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

type AnimationTimingSource = {
  duration?: number;
  fps?: number;
  enableWorkArea?: boolean;
  workStart?: number;
  workEnd?: number;
  loopValue?: number;
};

const RIVE_LOOP = 1;
const RIVE_PING_PONG = 2;

function getAnimationDuration(
  definition: unknown,
  instance: LinearAnimationInstance,
): number {
  const timing = definition as AnimationTimingSource;
  const duration = Number(timing?.duration) || 0;
  const fps = Number(timing?.fps) || 0;
  const workStart = Number(timing?.workStart);
  const workEnd = Number(timing?.workEnd);
  if (
    timing?.enableWorkArea
    && fps > 0
    && Number.isFinite(workStart)
    && Number.isFinite(workEnd)
    && workEnd > workStart
  ) {
    return (workEnd - workStart) / fps;
  }
  if (duration > 0) return fps > 0 ? duration / fps : duration;

  const instanceDuration = Number(instance.duration) || 0;
  if (instanceDuration > 0) return instanceDuration;
  const instanceFps = Number(instance.fps) || 0;
  const instanceStart = Number(instance.workStart);
  const instanceEnd = Number(instance.workEnd);
  return instanceFps > 0 && instanceEnd > instanceStart
    ? (instanceEnd - instanceStart) / instanceFps
    : 0;
}

function getAnimationLoopValue(
  definition: unknown,
  instance: LinearAnimationInstance,
): number {
  const definitionLoop = Number((definition as AnimationTimingSource)?.loopValue);
  if (Number.isFinite(definitionLoop)) return definitionLoop;
  const instanceLoop = Number(instance.loopValue);
  return Number.isFinite(instanceLoop) ? instanceLoop : 0;
}

export function getTimelinePosition(
  elapsed: number,
  duration: number,
  loopValue: number,
  completed = false,
): Pick<TimelineProgress, "time" | "progress"> {
  const safeElapsed = Math.max(0, Number(elapsed) || 0);
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (completed) return { time: safeDuration, progress: 1 };
  if (!safeDuration) return { time: safeElapsed, progress: 0 };

  let time = Math.min(safeElapsed, safeDuration);
  if (loopValue === RIVE_LOOP) {
    time = safeElapsed % safeDuration;
  } else if (loopValue === RIVE_PING_PONG) {
    const cycleDuration = safeDuration * 2;
    const cycleTime = safeElapsed % cycleDuration;
    time = cycleTime <= safeDuration ? cycleTime : cycleDuration - cycleTime;
  }
  return { time, progress: Math.min(1, Math.max(0, time / safeDuration)) };
}

export class WebRivePlayer {
  private canvas: HTMLCanvasElement;
  private callbacks: PlayerCallbacks;
  private runtime: RiveCanvas | null = null;
  private renderer: WrappedRenderer | null = null;
  private file: RiveFile | null = null;
  private artboard: Artboard | null = null;
  private stateMachine: StateMachineInstance | null = null;
  private animation: LinearAnimationInstance | null = null;
  private viewMatrix: Mat2D | null = null;
  private inputRefs: ReturnType<StateMachineInstance["input"]>[] = [];
  private boundViewModels: ViewModelInstance[] = [];
  private artboardMetadata = new Map<string, ArtboardMetadata>();
  private catalogNames: string[] = [];
  private catalogLoaded = false;
  private activeArtboardName = "";
  private selectedStateMachineName = "";
  private activeStateMachineName = "";
  private activeAnimationName = "";
  private sequenceNames: string[] = [];
  private sequenceIndex = -1;
  private sequenceElapsed = 0;
  private sequenceHasOut = false;
  private animationDuration = 0;
  private animationElapsed = 0;
  private animationLoopValue = 0;
  private fit: "contain" | "cover" = "contain";
  private playing = true;
  private audioEnabled = true;
  private speed = 1;
  private requestedQuality = 1;
  private effectiveQuality = 1;
  private frameInterval = 1000 / 30;
  private lastRenderedAt = 0;
  private sourceSize = 0;
  private complexFile = false;
  private cssWidth = 1;
  private cssHeight = 1;
  private lastTimestamp = 0;
  private frameRequest = 0;
  private lastProgressAt = 0;
  private performanceStartedAt = 0;
  private performanceFrames = 0;
  private lastMetadataKey = "";
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, callbacks: PlayerCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
  }

  async load(source: ArrayBuffer): Promise<RiveMetadata> {
    this.disposeFile();
    this.disposed = false;
    this.runtime = await getRuntime();
    this.renderer = this.runtime.makeRenderer(this.canvas);
    this.sourceSize = source.byteLength;
    this.file = await this.runtime.load(new Uint8Array(source));
    const defaultArtboard = this.file.defaultArtboard();
    if (!defaultArtboard) throw new Error("文件中没有可预览的画板");
    const metadata = this.inspectArtboard(defaultArtboard);
    this.artboardMetadata.set(metadata.name, metadata);
    this.catalogNames = [metadata.name];
    this.catalogLoaded = this.file.artboardCount() <= 1;
    this.complexFile = this.sourceSize >= 2 * 1024 * 1024
      || this.file.artboardCount() >= 24
      || metadata.animations.length >= 48
      || metadata.stateMachines.length >= 24;
    this.configurePerformanceProfile();
    this.activateArtboard(metadata.name, undefined, defaultArtboard);
    if (!this.activeStateMachineHasListeners()) this.playDefaultSequence(metadata.animations);
    this.resize(this.cssWidth, this.cssHeight);
    this.requestFrame();
    return this.emitMetadata(true);
  }

  private inspectArtboard(artboard: Artboard): ArtboardMetadata {
    const animations = Array.from({ length: artboard.animationCount() }, (_, index) => (
      artboard.animationByIndex(index)?.name || `动画 ${index + 1}`
    ));
    const stateMachines = Array.from({ length: artboard.stateMachineCount() }, (_, index) => (
      artboard.stateMachineByIndex(index)?.name || `状态机 ${index + 1}`
    ));
    const bounds = artboard.bounds;
    return {
      name: artboard.name || "默认画板",
      width: Math.max(1, bounds.maxX - bounds.minX),
      height: Math.max(1, bounds.maxY - bounds.minY),
      animations,
      stateMachines,
    };
  }

  async loadArtboardCatalog(onProgress: (progress: number) => void): Promise<string[]> {
    if (!this.file) return this.catalogNames;
    if (this.catalogLoaded) {
      onProgress(100);
      return this.catalogNames;
    }
    const count = this.file.artboardCount();
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const artboard = this.file.artboardByIndex(index);
      if (artboard) {
        names.push(artboard.name || `画板 ${index + 1}`);
        artboard.delete();
      }
      onProgress(Math.round(((index + 1) / count) * 100));
      if ((index + 1) % 4 === 0) await yieldToBrowser();
    }
    this.catalogNames = Array.from(new Set(names));
    this.catalogLoaded = true;
    this.emitMetadata(true);
    return this.catalogNames;
  }

  private activateArtboard(name: string, machineName?: string, prepared?: Artboard): void {
    if (!this.file || !this.runtime) return;
    this.disposeActiveInstances();
    const artboard = prepared || this.file.artboardByName(name);
    if (!artboard) throw new Error(`没有找到画板：${name}`);
    this.artboard = artboard;
    this.activeArtboardName = artboard.name;
    let metadata = this.artboardMetadata.get(artboard.name);
    if (!metadata) {
      metadata = this.inspectArtboard(artboard);
      this.artboardMetadata.set(metadata.name, metadata);
    }
    const selectedMachine = machineName || metadata.stateMachines[0] || "";
    this.selectedStateMachineName = selectedMachine;
    if (selectedMachine) {
      const definition = artboard.stateMachineByName(selectedMachine);
      this.stateMachine = new this.runtime.StateMachineInstance(definition, artboard);
      this.activeStateMachineName = selectedMachine;
      this.inputRefs = Array.from(
        { length: this.stateMachine.inputCount() },
        (_, index) => this.stateMachine!.input(index),
      );
      this.bindDefaultViewModels(this.stateMachine);
      this.stateMachine.advance(0);
      this.artboard.advance(0);
    } else {
      this.bindDefaultViewModels(this.artboard);
      if (!this.playDefaultSequence(metadata.animations)) {
        this.activeAnimationName = "";
      }
    }
    this.applyAudioPreference();
    this.playing = true;
    this.lastTimestamp = 0;
    this.updateViewMatrix();
    this.callbacks.onPlayback(true, selectedMachine ? `状态机 ${selectedMachine}` : "正在播放");
    this.emitMetadata(true);
    this.requestFrame();
  }

  private bindDefaultViewModels(target: StateMachineInstance | Artboard): void {
    if (!this.file || !this.artboard || !("bind" in target)) return;
    try {
      const viewModel = this.file.defaultArtboardViewModel(this.artboard);
      const instance = viewModel?.defaultInstance?.();
      if (instance) {
        this.boundViewModels.push(instance);
        target.setViewModelInstance(instance);
      }
      for (const name of this.file.globalViewModelNames?.() || []) {
        const globalInstance = this.file.viewModelByName(name)?.defaultInstance?.();
        if (!globalInstance) continue;
        this.boundViewModels.push(globalInstance);
        target.setGlobalViewModelInstance?.(name, globalInstance);
      }
      target.bind();
    } catch (error) {
      console.warn("Rive View Model 自动绑定失败", error);
    }
  }

  private getDefaultSequence(animations: string[]): string[] {
    const find = (target: string) => animations.find((name) => name.trim().toLowerCase() === target);
    return [find("in"), find("idle"), find("out")].filter(Boolean) as string[];
  }

  private playDefaultSequence(animations?: string[]): boolean {
    const names = this.getDefaultSequence(animations || this.currentMetadata()?.animations || []);
    if (!names.length) return false;
    this.sequenceNames = names;
    this.sequenceIndex = 0;
    this.sequenceHasOut = names.some((name) => name.trim().toLowerCase() === "out");
    this.activateAnimationInstance(names[0], true);
    return true;
  }

  private activeStateMachineHasListeners(): boolean {
    if (!this.runtime || !this.stateMachine || typeof this.runtime.hasListeners !== "function") return false;
    try {
      return Boolean(this.runtime.hasListeners(this.stateMachine));
    } catch {
      return false;
    }
  }

  private activateAnimationInstance(name: string, keepSequence = false): void {
    if (!this.file || !this.runtime) return;
    const artboardName = this.activeArtboardName;
    this.disposeActiveInstances();
    this.artboard = this.file.artboardByName(artboardName);
    if (!this.artboard) return;
    const definition = this.artboard.animationByName(name);
    this.animation = new this.runtime.LinearAnimationInstance(definition, this.artboard);
    this.animationDuration = getAnimationDuration(definition, this.animation);
    this.animationElapsed = 0;
    this.animationLoopValue = getAnimationLoopValue(definition, this.animation);
    this.activeAnimationName = name;
    this.activeStateMachineName = "";
    this.sequenceElapsed = 0;
    if (!keepSequence) {
      this.sequenceNames = [];
      this.sequenceIndex = -1;
      this.sequenceHasOut = false;
    }
    this.bindDefaultViewModels(this.artboard);
    this.applyAudioPreference();
    this.playing = true;
    this.lastTimestamp = 0;
    this.updateViewMatrix();
    this.publishProgress();
    this.callbacks.onPlayback(true, `播放 ${name}`);
    this.emitMetadata(true);
    this.requestFrame();
  }

  private advanceSequence(delta: number): boolean {
    if (!this.animation || this.sequenceIndex < 0) return false;
    this.sequenceElapsed += delta;
    const completed = Boolean(this.animation.didLoop)
      || (this.animationDuration > 0 && this.sequenceElapsed + 0.001 >= this.animationDuration);
    if (!completed) return false;
    const currentName = this.sequenceNames[this.sequenceIndex] || "";
    const isIdle = currentName.trim().toLowerCase() === "idle";
    if (isIdle && !this.sequenceHasOut) {
      this.sequenceElapsed = 0;
      return false;
    }
    const nextIndex = this.sequenceIndex + 1;
    if (nextIndex < this.sequenceNames.length) {
      this.sequenceIndex = nextIndex;
      this.activateAnimationInstance(this.sequenceNames[nextIndex], true);
      return false;
    }
    this.playing = false;
    this.publishProgress(true);
    this.callbacks.onPlayback(false, `${currentName} 播放完成`);
    return true;
  }

  private requestFrame(): void {
    if (!this.runtime || this.frameRequest || this.disposed) return;
    this.frameRequest = this.runtime.requestAnimationFrame((timestamp) => this.frame(timestamp));
  }

  private frame(timestamp: number): void {
    this.frameRequest = 0;
    if (this.disposed || !this.runtime || !this.artboard || !this.renderer) return;
    if (
      this.playing
      && this.lastRenderedAt
      && timestamp - this.lastRenderedAt < this.frameInterval
    ) {
      this.requestFrame();
      return;
    }
    this.lastRenderedAt = timestamp;
    const rawDelta = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0;
    this.lastTimestamp = timestamp;
    const delta = Math.min(0.064, Math.max(0, rawDelta)) * this.speed;
    let sequenceCompleted = false;
    if (this.playing) {
      if (this.stateMachine) {
        this.stateMachine.advance(delta);
        this.artboard.advance(delta);
      } else if (this.animation) {
        this.animation.advance(delta);
        this.animation.apply(1);
        this.animationElapsed += delta;
        this.artboard.advance(delta);
        sequenceCompleted = this.advanceSequence(delta);
      }
    }
    this.draw();
    if (!sequenceCompleted) this.emitProgress(timestamp);
    this.emitPerformance(timestamp);
    this.emitMetadata(false);
    if (this.playing) this.requestFrame();
  }

  private draw(): void {
    if (!this.runtime || !this.renderer || !this.artboard || !this.viewMatrix) return;
    this.renderer.clear();
    this.renderer.save();
    this.renderer.align(
      this.fit === "cover" ? this.runtime.Fit.cover : this.runtime.Fit.contain,
      this.runtime.Alignment.center,
      { minX: 0, minY: 0, maxX: this.canvas.width, maxY: this.canvas.height },
      this.artboard.bounds,
    );
    this.artboard.draw(this.renderer);
    this.renderer.restore();
  }

  private emitProgress(timestamp: number): void {
    if (!this.animation || timestamp - this.lastProgressAt < 100) return;
    this.lastProgressAt = timestamp;
    this.publishProgress();
  }

  private publishProgress(completed = false): void {
    if (!this.animation) return;
    const duration = this.animationDuration;
    const { time, progress } = getTimelinePosition(
      this.animationElapsed,
      duration,
      this.animationLoopValue,
      completed,
    );
    this.callbacks.onProgress({
      name: this.activeAnimationName,
      time,
      duration,
      progress,
    });
  }

  private emitPerformance(timestamp: number): void {
    if (!this.performanceStartedAt) this.performanceStartedAt = timestamp;
    this.performanceFrames += 1;
    const elapsed = timestamp - this.performanceStartedAt;
    if (elapsed < 700) return;
    this.callbacks.onPerformance(Math.round((this.performanceFrames * 1000) / elapsed));
    this.performanceStartedAt = timestamp;
    this.performanceFrames = 0;
  }

  private describeInputs(): RiveInput[] {
    if (!this.runtime) return [];
    return this.inputRefs.map((input, index) => {
      let type: RiveInput["type"] = "number";
      if (input.type === this.runtime!.SMIInput.bool) type = "boolean";
      if (input.type === this.runtime!.SMIInput.trigger) type = "trigger";
      return {
        index,
        name: input.name,
        type,
        value: type === "trigger" ? null : (input.value ?? 0),
      };
    });
  }

  private currentMetadata(): ArtboardMetadata | undefined {
    return this.artboardMetadata.get(this.activeArtboardName);
  }

  private emitMetadata(force: boolean): RiveMetadata {
    const metadata = this.currentMetadata() || {
      name: this.activeArtboardName,
      width: 1,
      height: 1,
      animations: [],
      stateMachines: [],
    };
    const value: RiveMetadata = {
      artboardNames: this.catalogNames,
      artboardCount: this.file?.artboardCount() || this.catalogNames.length,
      artboardCatalogLoaded: this.catalogLoaded,
      activeArtboard: this.activeArtboardName,
      stateMachines: metadata.stateMachines,
      activeStateMachine: this.activeStateMachineName,
      animations: metadata.animations,
      activeAnimation: this.activeAnimationName,
      inputs: this.describeInputs(),
      width: metadata.width,
      height: metadata.height,
      hasAudio: Boolean(this.file?.hasAudio || this.artboard?.hasAudio),
      audioEnabled: this.audioEnabled,
    };
    const key = JSON.stringify([
      value.activeArtboard,
      value.activeStateMachine,
      value.activeAnimation,
      value.artboardNames,
      value.inputs.map((input) => input.value),
      value.audioEnabled,
    ]);
    if (force || key !== this.lastMetadataKey) {
      this.lastMetadataKey = key;
      this.callbacks.onMetadata(value);
    }
    return value;
  }

  private updateViewMatrix(): void {
    if (!this.runtime || !this.artboard) return;
    this.viewMatrix?.delete();
    this.viewMatrix = this.runtime.computeAlignment(
      this.fit === "cover" ? this.runtime.Fit.cover : this.runtime.Fit.contain,
      this.runtime.Alignment.center,
      { minX: 0, minY: 0, maxX: this.canvas.width, maxY: this.canvas.height },
      this.artboard.bounds,
    );
    this.canvas.dataset.riveFit = this.fit;
    this.canvas.dataset.riveMatrix = [
      this.viewMatrix.xx,
      this.viewMatrix.xy,
      this.viewMatrix.yx,
      this.viewMatrix.yy,
      this.viewMatrix.tx,
      this.viewMatrix.ty,
    ].map((value) => Number(value.toFixed(4))).join(",");
  }

  resize(width: number, height: number): void {
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.effectiveQuality);
    const nextWidth = Math.max(1, Math.round(this.cssWidth * pixelRatio));
    const nextHeight = Math.max(1, Math.round(this.cssHeight * pixelRatio));
    if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
    if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;
    if (this.artboard) this.artboard.devicePixelRatioUsed = pixelRatio;
    this.updateViewMatrix();
    this.requestFrame();
  }

  setFit(fit: "contain" | "cover"): void {
    this.fit = fit;
    this.updateViewMatrix();
    this.requestFrame();
  }

  setQuality(quality: number): void {
    this.requestedQuality = Math.max(1, Math.min(2, quality));
    this.configurePerformanceProfile();
    this.resize(this.cssWidth, this.cssHeight);
  }

  private configurePerformanceProfile(): void {
    const requestedFps = this.requestedQuality <= 1
      ? 30
      : (this.requestedQuality < 2 ? 45 : 60);
    const safetyPixelRatio = this.complexFile ? 1.25 : 2;
    const safetyFps = this.complexFile ? 30 : 60;
    this.effectiveQuality = Math.min(this.requestedQuality, safetyPixelRatio);
    this.frameInterval = 1000 / Math.min(requestedFps, safetyFps);
    this.lastRenderedAt = 0;
    this.performanceStartedAt = 0;
    this.performanceFrames = 0;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(8, speed));
  }

  setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;
    this.applyAudioPreference();
    this.emitMetadata(true);
  }

  private applyAudioPreference(): void {
    if (!this.artboard) return;
    try {
      this.artboard.volume = this.audioEnabled ? 1 : 0;
    } catch (error) {
      console.warn("Rive 音量设置失败", error);
    }
  }

  play(): void {
    if (
      this.animation
      && this.sequenceIndex >= 0
      && this.animationDuration > 0
      && this.sequenceElapsed + 0.001 >= this.animationDuration
    ) {
      this.playDefaultSequence();
      return;
    }
    this.playing = true;
    this.lastTimestamp = 0;
    this.callbacks.onPlayback(true, this.activeAnimationName ? `播放 ${this.activeAnimationName}` : "正在播放");
    this.requestFrame();
  }

  pause(): void {
    this.playing = false;
    this.lastTimestamp = 0;
    if (this.runtime && this.frameRequest) this.runtime.cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.callbacks.onPlayback(false, "已暂停");
  }

  reset(): void {
    this.activateArtboard(this.activeArtboardName, this.selectedStateMachineName || undefined);
    if (!this.activeStateMachineHasListeners()) this.playDefaultSequence();
  }

  selectArtboard(name: string): void {
    this.activateArtboard(name);
    if (!this.activeStateMachineHasListeners()) this.playDefaultSequence();
  }

  selectStateMachine(name: string): void {
    this.activateArtboard(this.activeArtboardName, name);
  }

  selectAnimation(name: string): void {
    this.activateAnimationInstance(name);
  }

  setInput(index: number, value: boolean | number): void {
    if (!this.inputRefs[index] && !this.ensureStateMachine()) return;
    const input = this.inputRefs[index];
    if (!input) return;
    input.value = value;
    this.stateMachine?.advance(0);
    this.artboard?.advance(0);
    this.draw();
    this.emitMetadata(true);
    this.play();
  }

  fireInput(index: number): void {
    if (!this.inputRefs[index] && !this.ensureStateMachine()) return;
    const input = this.inputRefs[index];
    if (!input) return;
    input.fire();
    this.stateMachine?.advance(0);
    this.artboard?.advance(0);
    this.draw();
    this.play();
  }

  pointer(type: "down" | "move" | "up" | "exit", x: number, y: number, id: number): void {
    if (!this.stateMachine && type === "down") this.ensureStateMachine();
    if (!this.stateMachine || !this.viewMatrix) return;
    const backingPoint = canvasPointToBacking(
      x,
      y,
      this.cssWidth,
      this.cssHeight,
      this.canvas.width,
      this.canvas.height,
    );
    const artboardPoint = backingPointToArtboard(this.viewMatrix, backingPoint.x, backingPoint.y);
    if (!artboardPoint) return;
    const method = {
      down: "pointerDown",
      move: "pointerMove",
      up: "pointerUp",
      exit: "pointerExit",
    }[type] as "pointerDown" | "pointerMove" | "pointerUp" | "pointerExit";
    this.stateMachine[method](artboardPoint.x, artboardPoint.y, id);
    this.stateMachine.advance(0);
    this.artboard?.advance(0);
    this.draw();
    this.emitMetadata(true);
    if (!this.playing) this.play();
  }

  private ensureStateMachine(): boolean {
    const targetName = this.selectedStateMachineName;
    if (!targetName) return false;
    if (!this.stateMachine || this.activeStateMachineName !== targetName) {
      this.activateArtboard(this.activeArtboardName, targetName);
      this.emitMetadata(true);
    }
    return true;
  }

  private disposeActiveInstances(): void {
    this.stateMachine?.delete();
    this.animation?.delete();
    this.artboard?.delete();
    this.viewMatrix?.delete();
    this.boundViewModels.forEach((instance) => instance.unref?.());
    this.stateMachine = null;
    this.animation = null;
    this.animationDuration = 0;
    this.animationElapsed = 0;
    this.animationLoopValue = 0;
    this.artboard = null;
    this.viewMatrix = null;
    this.inputRefs = [];
    this.boundViewModels = [];
    this.activeStateMachineName = "";
    this.activeAnimationName = "";
  }

  private disposeFile(): void {
    if (this.runtime && this.frameRequest) this.runtime.cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.disposeActiveInstances();
    this.file?.unref();
    this.renderer?.delete();
    this.file = null;
    this.renderer = null;
    this.artboardMetadata.clear();
    this.catalogNames = [];
    this.catalogLoaded = false;
    this.selectedStateMachineName = "";
    this.lastMetadataKey = "";
    this.lastRenderedAt = 0;
    this.performanceStartedAt = 0;
    this.performanceFrames = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.disposeFile();
  }
}
