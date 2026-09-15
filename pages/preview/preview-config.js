const rivePolicy = require('../../shared/rive-policy.js')

const FIT_OPTIONS = [
  { key: 'contain', label: '完整' },
  { key: 'cover', label: '铺满' }
]
const SPEED_OPTIONS = [...rivePolicy.speeds.slice(1), rivePolicy.speeds[0]]
  .map((value) => ({ value, label: `${value}x` }))
const QUALITY_OPTIONS = [
  { key: 'performance', label: '性能' },
  { key: 'balanced', label: '平衡' },
  { key: 'high', label: '高清' }
]

function createPreviewInitialData() {
  return {
    file: null,
    loading: true,
    loadingProgress: 0,
    loadingPhase: '正在准备文件',
    error: '',
    fitOptions: FIT_OPTIONS,
    qualityOptions: QUALITY_OPTIONS,
    qualityMode: 'performance',
    speedMenuOptions: [...SPEED_OPTIONS].reverse(),
    fit: 'cover',
    alignment: 'center',
    speedValue: 1,
    speedLabel: '1x',
    showSpeedMenu: false,
    speedMenuLeaving: false,
    speedMenuStyle: '',
    speedHoverValue: 1,
    isPlaying: true,
    artboardNames: [],
    artboardIndex: 0,
    artboardCount: 0,
    artboardRemainingCount: 0,
    artboardCatalogLoaded: true,
    artboardCatalogLoading: false,
    artboardCatalogProgress: 0,
    stateMachineNames: [],
    stateMachineIndex: 0,
    animationNames: [],
    activeAnimation: '',
    animationProgress: 0,
    timelineTimecode: '--:--.- / --:--.-',
    inputs: [],
    hasAudio: false,
    audioEnabled: true,
    audioSupported: true,
    audioBlockedReason: '',
    dimensions: '',
    activeState: '等待状态变化',
    fps: 0,
    canvasTone: 'mist',
    stageHeight: 480,
    stageWidth: 702,
    stageMinHeight: 320,
    stageMaxHeight: 980,
    stageDragging: false,
    stageResizeMenuActive: false,
    stageResizeTapOpen: false,
    stageResizePressActive: false,
    stageResizeHoverFit: '',
    stageViewMode: 'auto',
    resizeAdjustmentCount: 0,
    showResizeGuide: false,
    resizeGuideLeaving: false,
    previewTransitionVisible: false,
    previewTransitionExpanding: false,
    previewTransitionLeaving: false,
    previewTransitionCover: '',
    previewTransitionStyle: '',
    hasPreviousFile: false,
    hasNextFile: false,
    showFileNavigation: false,
    fileMenuOptions: [],
    showFileMenu: false,
    fileMenuLeaving: false,
    fileMenuStyle: '',
    fileHoverId: ''
  }
}

module.exports = {
  AUDIO_STORAGE_KEY: 'riveAudioEnabled',
  createPreviewInitialData,
  QUALITY_OPTIONS,
  QUALITY_STORAGE_KEY: 'riveQualityMode',
  rivePolicy,
  SPEED_OPTIONS,
  STAGE_RESIZE_DOUBLE_TAP_DELAY: rivePolicy.gesture.miniDoubleTapMs,
  STAGE_RESIZE_GESTURE_SLOP_RPX: rivePolicy.gesture.miniSlopRpx,
  STAGE_RESIZE_MENU_DISMISS_DELAY: rivePolicy.gesture.menuDismissMs
}
