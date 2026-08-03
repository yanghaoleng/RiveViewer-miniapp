const {
  formatSize,
  getAllFiles,
  getFileById,
  readFileWithProgress,
  saveCover,
  updateMetadata
} = require('../../utils/library')
const {
  describeFileActionError,
  isCancelError,
  isDesktopWechat,
  savePreparedFileToDisk,
  sharePreparedFile
} = require('../../utils/file-actions')
const { NativeRivePlayer } = require('../../utils/rive-native')
const {
  createShareAppMessage,
  createShareTimeline,
  enableShareMenu,
  isShareLanding,
  openShareLanding
} = require('../../utils/share')

const FIT_OPTIONS = [
  { key: 'contain', label: '完整' },
  { key: 'cover', label: '铺满' }
]

const SPEED_OPTIONS = [
  { value: 1, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
  { value: 8, label: '8x' },
  { value: 0.5, label: '0.5x' },
]

function formatTimelineTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(value / 60)
  const remainder = value - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`
}

function sortTimelineNames(names = []) {
  const priority = { in: 0, idle: 1, out: 2 }
  return [...names].sort((left, right) => {
    const leftKey = String(left).trim().toLowerCase()
    const rightKey = String(right).trim().toLowerCase()
    const leftPriority = priority[leftKey] ?? 10
    const rightPriority = priority[rightKey] ?? 10
    return leftPriority - rightPriority
  })
}

Page({
  data: {
    file: null,
    loading: true,
    loadingProgress: 0,
    loadingPhase: '正在准备文件',
    error: '',
    fitOptions: FIT_OPTIONS,
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
    artboards: [],
    artboardNames: [],
    artboardIndex: 0,
    stateMachines: [],
    stateMachineNames: [],
    stateMachineIndex: 0,
    animations: [],
    animationNames: [],
    activeAnimation: '',
    animationProgress: 0,
    timelineTimecode: '--:--.- / --:--.-',
    inputs: [],
    dimensions: '',
    activeState: '等待状态变化',
    canvasTone: 'mist',
    stageHeight: 480,
    stageWidth: 702,
    stageMinHeight: 320,
    stageMaxHeight: 980,
    stageDragging: false,
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
    fileMenuStyle: ''
  },

  onLoad(options) {
    enableShareMenu()
    if (isShareLanding(options)) {
      openShareLanding()
      return
    }
    this.resizeGuideDismissed = Boolean(wx.getStorageSync('riveResizeGuideDismissed'))
    this.initializeStageMetrics()
    const fileId = decodeURIComponent(options.id || '')
    const file = getFileById(fileId)
    if (!file) {
      wx.showToast({ title: '文件不存在', icon: 'none' })
      wx.navigateBack()
      return
    }
    const pendingTransition = getApp().globalData.pendingPreviewTransition
    getApp().globalData.pendingPreviewTransition = null
    if (
      pendingTransition?.fileId === fileId
      && pendingTransition.cover
      && pendingTransition.rect
    ) {
      this.pendingPreviewTransition = pendingTransition
      this.setData({
        previewTransitionVisible: true,
        previewTransitionCover: pendingTransition.cover,
        previewTransitionStyle: this.getTransitionStyle(pendingTransition.rect, 7)
      })
    }
    this.syncFileNavigation(file.id)
    this.setData({ file })
  },

  onShareAppMessage() {
    return createShareAppMessage()
  },

  onShareTimeline() {
    return createShareTimeline()
  },

  onReady() {
    this.previewReady = true
    if (this.data.file) {
      this.startPreview()
      this.startPreviewTransition()
    }
  },

  onShow() {
    this.pageVisible = true
    if (this.previewReady && this.data.file && !this.player && !this.previewLoading) {
      this.startPreview()
    }
  },

  onHide() {
    this.pageVisible = false
    this.disposePreview()
  },

  onUnload() {
    this.pageVisible = false
    this.disposePreview()
  },

  disposePreview() {
    clearTimeout(this.canvasResizeTimer)
    clearTimeout(this.coverCaptureTimer)
    clearTimeout(this.resizeGuideTimer)
    clearTimeout(this.speedLongPressTimer)
    clearTimeout(this.speedMenuDismissTimer)
    clearTimeout(this.speedMenuCloseTimer)
    clearTimeout(this.fileNavigationLongPressTimer)
    clearTimeout(this.fileMenuDismissTimer)
    clearTimeout(this.fileMenuCloseTimer)
    clearTimeout(this.previewTransitionStartTimer)
    clearTimeout(this.previewTransitionFadeTimer)
    clearTimeout(this.previewTransitionEndTimer)
    clearInterval(this.runtimeProgressTimer)
    clearTimeout(this.firstFrameFallbackTimer)
    clearTimeout(this.loadingHideTimer)
    this.previewLoadToken = (this.previewLoadToken || 0) + 1
    this.previewLoading = false
    this.player?.dispose()
    this.player = null
  },

  setLoadingProgress(progress, phase, loadToken = this.previewLoadToken) {
    if (loadToken !== this.previewLoadToken || !this.pageVisible) return
    const nextProgress = Math.max(
      this.loadProgressValue || 0,
      Math.min(100, Math.round(progress))
    )
    this.loadProgressValue = nextProgress
    this.setData({
      loadingProgress: nextProgress,
      loadingPhase: phase || this.data.loadingPhase
    })
  },

  startRuntimeProgress(loadToken) {
    clearInterval(this.runtimeProgressTimer)
    this.runtimeProgressTimer = setInterval(() => {
      if (loadToken !== this.previewLoadToken || !this.data.loading) {
        clearInterval(this.runtimeProgressTimer)
        return
      }
      const current = this.loadProgressValue || 62
      const step = current < 78 ? 2 : 1
      this.setLoadingProgress(Math.min(92, current + step), '正在解析 Rive', loadToken)
    }, 180)
  },

  finishPreviewLoading(loadToken, canvas) {
    if (
      loadToken !== this.previewLoadToken
      || !this.pageVisible
      || this.completedLoadToken === loadToken
    ) return
    this.completedLoadToken = loadToken
    clearInterval(this.runtimeProgressTimer)
    clearTimeout(this.firstFrameFallbackTimer)
    this.setLoadingProgress(100, '画面已就绪', loadToken)
    clearTimeout(this.loadingHideTimer)
    this.loadingHideTimer = setTimeout(() => {
      if (loadToken !== this.previewLoadToken || !this.pageVisible) return
      this.setData({
        loading: false,
        isPlaying: true,
        activeState: '正在播放'
      })
      this.scheduleCoverCapture(canvas)
    }, 100)
  },

  initializeStageMetrics() {
    this.windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const windowWidth = Math.max(1, this.windowInfo.windowWidth || 375)
    const toRpx = (pixels) => pixels * 750 / windowWidth
    const windowHeight = this.windowInfo.windowHeight || 667
    this.autoStageMaxHeight = Math.min(980, Math.round(toRpx(windowHeight * 0.62)))
    this.baseStageMinHeight = Math.max(320, Math.round(toRpx(180)))
    this.baseStageMaxHeight = Math.max(720, Math.min(1120, Math.round(toRpx(windowHeight * 0.74))))
    this.setData({
      stageMinHeight: this.baseStageMinHeight,
      stageMaxHeight: this.baseStageMaxHeight
    })
  },

  getTransitionStyle(rect, radius) {
    return [
      `left:${Math.round(rect.left)}px`,
      `top:${Math.round(rect.top)}px`,
      `width:${Math.round(rect.width)}px`,
      `height:${Math.round(rect.height)}px`,
      `border-radius:${radius}px`
    ].join(';')
  },

  startPreviewTransition() {
    if (!this.pendingPreviewTransition || !this.data.previewTransitionVisible) return
    wx.createSelectorQuery()
      .select('.canvas-card')
      .boundingClientRect((rect) => {
        if (!rect?.width || !rect?.height) {
          this.setData({ previewTransitionVisible: false })
          return
        }
        this.previewTransitionStartTimer = setTimeout(() => {
          this.setData({
            previewTransitionExpanding: true,
            previewTransitionStyle: this.getTransitionStyle(rect, 10)
          })
        }, 24)
        this.previewTransitionFadeTimer = setTimeout(() => {
          this.setData({ previewTransitionLeaving: true })
        }, 350)
        this.previewTransitionEndTimer = setTimeout(() => {
          this.pendingPreviewTransition = null
          this.setData({
            previewTransitionVisible: false,
            previewTransitionExpanding: false,
            previewTransitionLeaving: false
          })
        }, 500)
      })
      .exec()
  },

  calculateAutoStageHeight(width, height) {
    return this.calculateStageSize(width, height).height
  },

  calculateStageSize(width, height, requestedHeight) {
    const safeWidth = width > 0 ? width : 702
    const safeHeight = height > 0 ? height : 480
    const ratio = safeWidth / safeHeight
    const availableWidth = 702
    const widthLimitedHeight = availableWidth / ratio
    const isCover = this.data.fit === 'cover'
    const maximumHeight = Math.max(
      1,
      isCover
        ? (this.baseStageMaxHeight || 980)
        : Math.min(this.baseStageMaxHeight || 980, widthLimitedHeight)
    )
    const minimumHeight = Math.min(this.baseStageMinHeight || 320, maximumHeight)
    const preferredHeight = requestedHeight === undefined
      ? Math.min(this.autoStageMaxHeight, widthLimitedHeight)
      : requestedHeight
    const stageHeight = Math.round(Math.max(
      minimumHeight,
      Math.min(maximumHeight, preferredHeight)
    ))
    return {
      height: stageHeight,
      width: isCover ? availableWidth : Math.round(stageHeight * ratio),
      minHeight: Math.round(minimumHeight),
      maxHeight: Math.round(maximumHeight)
    }
  },

  startPreview() {
    if (this.previewLoading || !this.pageVisible) return
    this.previewLoading = true
    const loadToken = (this.previewLoadToken || 0) + 1
    this.previewLoadToken = loadToken
    this.completedLoadToken = 0
    this.loadProgressValue = 0
    this.setData({
      loading: true,
      loadingProgress: 0,
      loadingPhase: '正在准备文件',
      error: ''
    })
    wx.createSelectorQuery()
      .select('#riveCanvas')
      .fields({ node: true, size: true, rect: true })
      .exec(async (result) => {
        const canvasInfo = result[0]
        if (!canvasInfo?.node) {
          this.previewLoading = false
          this.setData({ loading: false, error: '无法创建小程序 Canvas' })
          return
        }
        this.canvasRect = canvasInfo
        let bytes = null
        try {
          this.setLoadingProgress(4, '正在读取文件', loadToken)
          bytes = await readFileWithProgress(this.data.file.path, {
            expectedSize: this.data.file.size,
            shouldContinue: () => (
              loadToken === this.previewLoadToken && this.pageVisible
            ),
            onProgress: ({ ratio }) => {
              this.setLoadingProgress(5 + ratio * 55, '正在读取文件', loadToken)
            }
          })
          if (loadToken !== this.previewLoadToken || !this.pageVisible) return
          this.setLoadingProgress(62, '正在初始化 Rive', loadToken)
          this.startRuntimeProgress(loadToken)
          const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          const fileSize = this.data.file.size || bytes.byteLength || 0
          const ratioLimit = fileSize >= 16 * 1024 * 1024
            ? 1.25
            : (fileSize >= 4 * 1024 * 1024 ? 1.75 : 2.5)
          const player = new NativeRivePlayer({
            canvas: canvasInfo.node,
            width: canvasInfo.width,
            height: canvasInfo.height,
            pixelRatio: Math.min(windowInfo.pixelRatio || 1, ratioLimit),
            onMetadata: (metadata) => this.applyMetadata(metadata),
            onStateChange: (states) => {
              this.setData({ activeState: states.join(' / ') || '状态机运行中' })
            },
            onPlaybackChange: ({ isPlaying, activeState, animation }) => {
              const isTimelineStatus = /^播放\s+/.test(activeState || '')
              this.setData({
                isPlaying,
                activeState: activeState && !isTimelineStatus
                  ? activeState
                  : this.data.activeState,
                activeAnimation: animation === undefined ? this.data.activeAnimation : animation
              })
            },
            onTimelineProgress: ({ animation, progress, time, duration }) => {
              this.setData({
                activeAnimation: animation,
                animationProgress: Math.round(progress),
                timelineTimecode: duration > 0
                  ? `${formatTimelineTime(time)} / ${formatTimelineTime(duration)}`
                  : '--:--.- / --:--.-'
              })
            },
            onFirstFrame: () => this.finishPreviewLoading(loadToken, canvasInfo.node),
            onError: (error) => {
              console.error('Rive 原生运行时加载失败', error)
              clearInterval(this.runtimeProgressTimer)
              this.setData({
                loading: false,
                error: error.message || 'Rive 运行时加载失败'
              })
            }
          })
          this.player = player
          const loaded = await player.load(bytes)
          if (
            !loaded
            || loadToken !== this.previewLoadToken
            || !this.pageVisible
            || this.player !== player
          ) return
          this.setLoadingProgress(96, '正在准备首帧', loadToken)
          clearTimeout(this.firstFrameFallbackTimer)
          this.firstFrameFallbackTimer = setTimeout(() => {
            this.finishPreviewLoading(loadToken, canvasInfo.node)
          }, 1800)
        } catch (error) {
          if (loadToken !== this.previewLoadToken || !this.pageVisible) return
          clearInterval(this.runtimeProgressTimer)
          this.player?.dispose()
          this.player = null
          this.setData({
            loading: false,
            error: error.message || error.errMsg || '文件读取失败'
          })
        } finally {
          bytes = null
          if (loadToken === this.previewLoadToken) this.previewLoading = false
        }
      })
  },

  applyMetadata(metadata) {
    const artboardNames = metadata.artboards.map((item) => item.name)
    const stateMachineNames = metadata.stateMachines.map((item) => item.name)
    const summary = `${metadata.width} × ${metadata.height}${metadata.activeStateMachine ? ` · ${metadata.activeStateMachine}` : ''}`
    updateMetadata(this.data.file.id, {
      artboard: metadata.activeArtboard,
      animations: metadata.animations,
      stateMachine: metadata.activeStateMachine,
      inputs: metadata.inputs.map((input) => input.name),
      summary
    })
    const artboardChanged = this.lastActiveArtboard !== metadata.activeArtboard
    const stageViewMode = artboardChanged ? 'auto' : this.data.stageViewMode
    const stageSize = stageViewMode === 'compact'
      ? this.calculateCompactStageSize(metadata.width, metadata.height)
      : stageViewMode === 'manual'
        ? this.calculateStageSize(metadata.width, metadata.height, this.data.stageHeight)
        : this.calculateStageSize(metadata.width, metadata.height)
    const sizeChanged = stageSize.height !== this.data.stageHeight
      || stageSize.width !== this.data.stageWidth
    this.lastActiveArtboard = metadata.activeArtboard
    this.activeResourceSize = { width: metadata.width, height: metadata.height }
    this.setData({
      artboards: metadata.artboards,
      artboardNames,
      artboardIndex: Math.max(0, artboardNames.indexOf(metadata.activeArtboard)),
      stateMachines: metadata.stateMachines,
      stateMachineNames,
      stateMachineIndex: Math.max(0, stateMachineNames.indexOf(metadata.activeStateMachine)),
      animations: metadata.animations,
      animationNames: sortTimelineNames(metadata.animations),
      activeAnimation: metadata.activeAnimation || '',
      inputs: metadata.inputs,
      dimensions: `${metadata.width} × ${metadata.height}`,
      isPlaying: true,
      stageHeight: stageSize.height,
      stageWidth: stageSize.width,
      stageMinHeight: stageSize.minHeight,
      stageMaxHeight: stageSize.maxHeight,
      stageViewMode
    }, () => {
      if (sizeChanged) this.scheduleCanvasResize(360)
    })
  },

  scheduleCanvasResize(delay = 0) {
    clearTimeout(this.canvasResizeTimer)
    this.canvasResizeTimer = setTimeout(() => this.syncCanvasSize(), delay)
  },

  syncCanvasSize() {
    if (!this.player) return
    wx.createSelectorQuery()
      .select('#riveCanvas')
      .fields({ size: true, rect: true })
      .exec((result) => {
        const size = result[0]
        if (size?.width && size?.height) {
          this.canvasRect = size
          this.player?.resize(size.width, size.height)
        }
      })
  },

  stageResizeStart(event) {
    const touch = event.touches?.[0]
    if (!touch) return
    this.stageResizeStartY = touch.clientY === undefined ? touch.y : touch.clientY
    this.stageResizeStartX = touch.clientX === undefined ? touch.x : touch.clientX
    this.stageResizeStartHeight = this.data.stageHeight
    this.stageResizeMoved = false
    this.stageResizeFromHandle = true
  },

  stageResizeMove(event) {
    const touch = event.touches?.[0]
    if (!touch || this.stageResizeStartY === undefined) return
    const clientY = touch.clientY === undefined ? touch.y : touch.clientY
    const clientX = touch.clientX === undefined ? touch.x : touch.clientX
    const windowWidth = Math.max(1, this.windowInfo?.windowWidth || 375)
    const deltaRpx = (clientY - this.stageResizeStartY) * 750 / windowWidth
    const deltaXRpx = (clientX - this.stageResizeStartX) * 750 / windowWidth
    if (!this.stageResizeMoved) {
      if (Math.abs(deltaRpx) <= 6 || Math.abs(deltaRpx) < Math.abs(deltaXRpx)) return
      this.stageResizeMoved = true
      this.stageUserAdjusted = true
      this.setData({
        stageDragging: true,
        stageViewMode: 'manual'
      })
    }
    const stageSize = this.calculateStageSize(
      this.activeResourceSize?.width,
      this.activeResourceSize?.height,
      this.stageResizeStartHeight + deltaRpx
    )
    if (
      stageSize.height !== this.data.stageHeight
      || stageSize.width !== this.data.stageWidth
    ) {
      this.setData({
        stageHeight: stageSize.height,
        stageWidth: stageSize.width
      })
    }
  },

  stageResizeEnd() {
    if (this.stageResizeStartY === undefined) return
    const resized = this.stageResizeMoved
    this.stageResizeStartY = undefined
    this.stageResizeStartX = undefined
    this.ignoreNextStageTap = this.stageResizeFromHandle && this.stageResizeMoved
    this.stageResizeFromHandle = false
    if (this.data.stageDragging) {
      this.setData({ stageDragging: false }, () => this.syncCanvasSize())
    }
    if (resized) this.recordResizeAdjustment()
  },

  recordResizeAdjustment() {
    if (this.resizeGuideDismissed) return
    const resizeAdjustmentCount = this.data.resizeAdjustmentCount + 1
    this.setData({
      resizeAdjustmentCount,
      showResizeGuide: resizeAdjustmentCount >= 3
    })
  },

  stopResizeGuideTouch() {},

  dismissResizeGuide() {
    if (this.data.resizeGuideLeaving) return
    this.resizeGuideDismissed = true
    wx.setStorageSync('riveResizeGuideDismissed', true)
    this.setData({ resizeGuideLeaving: true })
    clearTimeout(this.resizeGuideTimer)
    this.resizeGuideTimer = setTimeout(() => {
      this.setData({
        showResizeGuide: false,
        resizeGuideLeaving: false
      })
    }, 190)
  },

  stageResizerTap() {
    if (this.ignoreNextStageTap) {
      this.ignoreNextStageTap = false
      return
    }
    const now = Date.now()
    if (this.lastStageTapAt && now - this.lastStageTapAt <= 320) {
      this.lastStageTapAt = 0
      this.toggleStageViewMode()
      return
    }
    this.lastStageTapAt = now
  },

  resetStageHeight() {
    this.setStageViewMode('auto')
  },

  toggleStageViewMode() {
    const nextMode = this.data.stageViewMode === 'auto' ? 'compact' : 'auto'
    this.setStageViewMode(nextMode)
  },

  calculateCompactStageSize(width, height) {
    const autoSize = this.calculateStageSize(width, height)
    return this.calculateStageSize(width, height, autoSize.minHeight)
  },

  setStageViewMode(mode) {
    if (!this.activeResourceSize) return
    this.stageResizeStartY = undefined
    this.stageResizeStartX = undefined
    const stageViewMode = mode === 'compact' ? 'compact' : 'auto'
    this.stageUserAdjusted = false
    const stageSize = stageViewMode === 'compact'
      ? this.calculateCompactStageSize(
        this.activeResourceSize.width,
        this.activeResourceSize.height
      )
      : this.calculateStageSize(
        this.activeResourceSize.width,
        this.activeResourceSize.height
      )
    this.setData({
      stageDragging: false,
      stageHeight: stageSize.height,
      stageWidth: stageSize.width,
      stageMinHeight: stageSize.minHeight,
      stageMaxHeight: stageSize.maxHeight,
      stageViewMode,
      activeState: stageViewMode === 'compact'
        ? '画板已缩小，参数区已展开'
        : '画板已恢复自适应，再次双击可查看完整参数'
    }, () => this.scheduleCanvasResize(360))
  },

  syncFileNavigation(fileId) {
    this.libraryFiles = getAllFiles()
    this.fileIndex = this.libraryFiles.findIndex((item) => item.id === fileId)
    this.setData({
      hasPreviousFile: this.fileIndex > 0,
      hasNextFile: this.fileIndex >= 0 && this.fileIndex < this.libraryFiles.length - 1,
      showFileNavigation: this.libraryFiles.length > 1,
      fileMenuOptions: this.libraryFiles.map((item) => ({
        id: item.id,
        name: item.name,
        current: item.id === fileId
      }))
    })
  },

  openAdjacentFile(event) {
    const offset = Number(event.currentTarget.dataset.offset)
    const target = this.libraryFiles?.[this.fileIndex + offset]
    this.openFileById(target?.id)
  },

  openFileById(fileId) {
    if (!fileId) return
    wx.redirectTo({
      url: `/pages/preview/index?id=${encodeURIComponent(fileId)}`
    })
  },

  fileNavigationTouchStart(event) {
    clearTimeout(this.fileNavigationLongPressTimer)
    clearTimeout(this.fileMenuDismissTimer)
    this.fileNavigationGestureActive = true
    this.fileNavigationLongPressed = false
    this.fileNavigationOffset = Number(event.currentTarget.dataset.offset)
    this.fileNavigationLongPressTimer = setTimeout(() => {
      this.fileNavigationLongPressed = true
      clearTimeout(this.fileMenuCloseTimer)
      this.openFileMenuAtAnchor()
    }, 320)
  },

  openFileMenuAtAnchor() {
    wx.createSelectorQuery()
      .select('.transport__files')
      .boundingClientRect((rect) => {
        const windowWidth = Math.max(1, this.windowInfo?.windowWidth || 375)
        const windowHeight = Math.max(1, this.windowInfo?.windowHeight || 667)
        const right = rect ? Math.max(12, windowWidth - rect.right) : 12
        const bottom = rect ? Math.max(12, windowHeight - rect.top + 6) : 74
        this.setData({
          showFileMenu: true,
          fileMenuLeaving: false,
          fileMenuStyle: `right:${right}px;bottom:${bottom}px;`
        })
      })
      .exec()
  },

  fileNavigationTouchEnd() {
    clearTimeout(this.fileNavigationLongPressTimer)
    const longPressed = this.fileNavigationLongPressed
    const offset = this.fileNavigationOffset
    this.fileNavigationGestureActive = false
    this.fileNavigationLongPressed = false
    this.fileNavigationOffset = 0
    if (!longPressed) {
      const target = this.libraryFiles?.[this.fileIndex + offset]
      this.openFileById(target?.id)
      return
    }
    this.scheduleFileMenuDismiss()
  },

  fileNavigationTouchCancel() {
    clearTimeout(this.fileNavigationLongPressTimer)
    this.fileNavigationGestureActive = false
    this.fileNavigationLongPressed = false
    this.fileNavigationOffset = 0
    if (this.data.showFileMenu) this.scheduleFileMenuDismiss()
  },

  selectFileFromMenu(event) {
    const fileId = event.currentTarget.dataset.id
    if (!fileId) return
    if (fileId === this.data.file.id) {
      this.closeFileMenu()
      return
    }
    this.closeFileMenu(() => this.openFileById(fileId))
  },

  closeFileMenu(onClosed) {
    clearTimeout(this.fileMenuDismissTimer)
    clearTimeout(this.fileMenuCloseTimer)
    if (!this.data.showFileMenu) {
      onClosed?.()
      return
    }
    this.setData({ fileMenuLeaving: true })
    this.fileMenuCloseTimer = setTimeout(() => {
      this.setData({
        showFileMenu: false,
        fileMenuLeaving: false
      }, () => onClosed?.())
    }, 150)
  },

  scheduleFileMenuDismiss() {
    clearTimeout(this.fileMenuDismissTimer)
    this.fileMenuDismissTimer = setTimeout(() => this.closeFileMenu(), 5000)
  },

  scheduleCoverCapture(canvas) {
    if (this.data.file.cover) return
    clearTimeout(this.coverCaptureTimer)
    this.coverCaptureTimer = setTimeout(() => this.captureCover(canvas), 620)
  },

  captureCanvasImage(canvas) {
    const sourceWidth = Math.max(1, canvas.width || 360)
    const sourceHeight = Math.max(1, canvas.height || 240)
    const targetRatio = 3 / 2
    let width = sourceWidth
    let height = sourceHeight
    let x = 0
    let y = 0
    if (sourceWidth / sourceHeight > targetRatio) {
      width = sourceHeight * targetRatio
      x = (sourceWidth - width) / 2
    } else {
      height = sourceWidth / targetRatio
      y = (sourceHeight - height) / 2
    }
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        x,
        y,
        width,
        height,
        destWidth: 360,
        destHeight: 240,
        fileType: 'png',
        quality: 0.86,
        success: (result) => resolve(result.tempFilePath),
        fail: reject
      }, this)
    })
  },

  async captureCover(canvas) {
    if (!this.player || this.data.file.cover) return
    try {
      const tempFilePath = await this.captureCanvasImage(canvas)
      const cover = await saveCover(this.data.file.id, tempFilePath)
      this.setData({ 'file.cover': cover })
    } catch (error) {
      console.warn('预览缩略图保存失败', error)
    }
  },

  togglePlay() {
    if (!this.player) return
    if (this.data.isPlaying) {
      this.player.pause()
      this.setData({ isPlaying: false, activeState: '已暂停' })
    } else {
      this.player.play()
      this.setData({ isPlaying: true, activeState: '正在播放' })
    }
  },

  resetAnimation() {
    if (!this.player) return
    this.player.reset()
    this.setData({ isPlaying: true, activeState: '已重置' })
  },

  cycleSpeed() {
    const currentIndex = SPEED_OPTIONS.findIndex((item) => item.value === this.data.speedValue)
    const option = SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length]
    this.applySpeedOption(option)
  },

  applySpeedOption(option) {
    if (!option) return
    this.player?.setSpeed(option.value)
    this.setData({
      speedValue: option.value,
      speedLabel: option.label,
      speedHoverValue: option.value
    })
  },

  speedTouchStart(event) {
    const touch = event.touches?.[0]
    if (!touch) return
    clearTimeout(this.speedLongPressTimer)
    clearTimeout(this.speedMenuDismissTimer)
    this.speedGestureActive = true
    this.speedLongPressTriggered = false
    this.speedGestureMovedIntoMenu = false
    this.speedTouchStartY = touch.clientY === undefined ? touch.y : touch.clientY
    this.speedLongPressTimer = setTimeout(() => {
      this.speedLongPressTriggered = true
      clearTimeout(this.speedMenuCloseTimer)
      this.openSpeedMenuAtAnchor()
    }, 320)
  },

  openSpeedMenuAtAnchor() {
    wx.createSelectorQuery()
      .select('.speed-menu-shell')
      .boundingClientRect((rect) => {
        const windowHeight = Math.max(1, this.windowInfo?.windowHeight || 667)
        const left = rect ? rect.left + rect.width / 2 : '50%'
        const bottom = rect ? Math.max(12, windowHeight - rect.top + 6) : 74
        const leftStyle = typeof left === 'number' ? `${left}px` : left
        this.setData({
          showSpeedMenu: true,
          speedMenuLeaving: false,
          speedMenuStyle: `left:${leftStyle};bottom:${bottom}px;`,
          speedHoverValue: this.data.speedValue
        }, () => this.measureSpeedMenu())
      })
      .exec()
  },

  measureSpeedMenu() {
    wx.createSelectorQuery()
      .select('.speed-popover')
      .boundingClientRect((rect) => {
        this.speedMenuRect = rect || null
      })
      .exec()
  },

  speedTouchMove(event) {
    if (!this.speedLongPressTriggered || !this.speedMenuRect) return
    const touch = event.touches?.[0]
    if (!touch) return
    const clientX = touch.clientX === undefined ? touch.x : touch.clientX
    const clientY = touch.clientY === undefined ? touch.y : touch.clientY
    const rect = this.speedMenuRect
    const inside = clientX >= rect.left - 18
      && clientX <= rect.right + 18
      && clientY >= rect.top
      && clientY <= rect.bottom
    if (!inside) return
    const index = Math.max(
      0,
      Math.min(
        this.data.speedMenuOptions.length - 1,
        Math.floor((clientY - rect.top) / (rect.height / this.data.speedMenuOptions.length))
      )
    )
    const option = this.data.speedMenuOptions[index]
    this.speedGestureMovedIntoMenu = true
    if (option && option.value !== this.data.speedHoverValue) {
      this.setData({ speedHoverValue: option.value })
    }
  },

  speedTouchEnd() {
    clearTimeout(this.speedLongPressTimer)
    const longPressed = this.speedLongPressTriggered
    const shouldApplyHover = longPressed && this.speedGestureMovedIntoMenu
    this.speedGestureActive = false
    this.speedLongPressTriggered = false
    this.speedGestureMovedIntoMenu = false
    if (!longPressed) {
      this.cycleSpeed()
      return
    }
    if (shouldApplyHover) {
      const option = SPEED_OPTIONS.find((item) => item.value === this.data.speedHoverValue)
      this.applySpeedOption(option)
      this.closeSpeedMenu()
      return
    }
    this.scheduleSpeedMenuDismiss()
  },

  speedTouchCancel() {
    clearTimeout(this.speedLongPressTimer)
    this.speedGestureActive = false
    this.speedLongPressTriggered = false
    this.speedGestureMovedIntoMenu = false
    this.scheduleSpeedMenuDismiss()
  },

  selectSpeedOption(event) {
    const value = Number(event.currentTarget.dataset.value)
    const option = SPEED_OPTIONS.find((item) => item.value === value)
    this.applySpeedOption(option)
    this.closeSpeedMenu()
  },

  closeSpeedMenu() {
    clearTimeout(this.speedMenuDismissTimer)
    clearTimeout(this.speedMenuCloseTimer)
    if (!this.data.showSpeedMenu) return
    this.setData({ speedMenuLeaving: true })
    this.speedMenuCloseTimer = setTimeout(() => {
      this.setData({
        showSpeedMenu: false,
        speedMenuLeaving: false
      })
    }, 150)
  },

  scheduleSpeedMenuDismiss() {
    clearTimeout(this.speedMenuDismissTimer)
    this.speedMenuDismissTimer = setTimeout(() => this.closeSpeedMenu(), 5000)
  },

  selectFit(event) {
    const fit = event.currentTarget.dataset.key
    this.player?.setFit(fit)
    this.stageUserAdjusted = false
    this.setData({ fit, stageViewMode: 'auto' }, () => {
      if (!this.activeResourceSize) return
      const stageSize = this.calculateStageSize(
        this.activeResourceSize.width,
        this.activeResourceSize.height
      )
      this.setData({
        stageHeight: stageSize.height,
        stageWidth: stageSize.width,
        stageMinHeight: stageSize.minHeight,
        stageMaxHeight: stageSize.maxHeight
      }, () => this.scheduleCanvasResize(360))
    })
  },

  changeArtboard(event) {
    const artboardIndex = Number(event.detail.value)
    this.stageUserAdjusted = false
    this.player?.selectArtboard(this.data.artboardNames[artboardIndex])
    this.setData({ artboardIndex, stageViewMode: 'auto', activeState: '画板已切换' })
  },

  selectArtboardTag(event) {
    const artboardIndex = Number(event.detail.index)
    if (artboardIndex === this.data.artboardIndex) return
    this.stageUserAdjusted = false
    this.player?.selectArtboard(this.data.artboardNames[artboardIndex])
    this.setData({ artboardIndex, stageViewMode: 'auto', activeState: '画板已切换' })
  },

  changeStateMachine(event) {
    const stateMachineIndex = Number(event.detail.value)
    this.player?.selectStateMachine(this.data.stateMachineNames[stateMachineIndex])
    this.setData({ stateMachineIndex, activeState: '状态机已切换' })
  },

  selectStateMachineTag(event) {
    const stateMachineIndex = Number(event.detail.index)
    if (stateMachineIndex === this.data.stateMachineIndex) return
    this.player?.selectStateMachine(this.data.stateMachineNames[stateMachineIndex])
    this.setData({ stateMachineIndex, activeState: '状态机已切换' })
  },

  playAnimation(event) {
    const name = event.detail.value
    this.player?.selectAnimation(name)
    this.setData({
      activeState: '正在播放',
      activeAnimation: name,
      animationProgress: 0,
      isPlaying: true
    })
  },

  fireInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const input = this.data.inputs[index]
    const result = this.player?.fireInput(
      index,
      this.data.stateMachineNames[this.data.stateMachineIndex]
    )
    this.setData({
      activeState: result?.fallbackAnimation
        ? `${input.name} 状态为空，已播放同名时间轴`
        : `触发 ${input.name}`,
      isPlaying: true
    })
  },

  toggleBooleanInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const value = event.detail.value
    this.player?.setInput(index, value, this.data.stateMachineNames[this.data.stateMachineIndex])
    this.setData({ [`inputs[${index}].value`]: value })
  },

  handleInputTag(event) {
    const index = Number(event.detail.index)
    const input = this.data.inputs[index]
    if (!input) return
    const machine = this.data.stateMachineNames[this.data.stateMachineIndex]
    if (input.type === 'trigger') {
      const result = this.player?.fireInput(index, machine)
      this.setData({
        activeState: result?.fallbackAnimation
          ? `${input.name} 状态为空，已播放同名时间轴`
          : `触发 ${input.name}`,
        isPlaying: true
      })
      return
    }
    if (input.type === 'boolean') {
      const value = !input.value
      this.player?.setInput(index, value, machine)
      this.setData({
        [`inputs[${index}].value`]: value,
        activeState: `${input.name}: ${value ? '开启' : '关闭'}`
      })
      return
    }
    wx.showModal({
      title: input.name,
      content: String(input.value ?? 0),
      editable: true,
      placeholderText: '输入数值',
      success: ({ confirm, content }) => {
        if (!confirm) return
        const value = Number(content)
        if (!Number.isFinite(value)) {
          wx.showToast({ title: '请输入有效数值', icon: 'none' })
          return
        }
        this.player?.setInput(index, value, machine)
        this.setData({
          [`inputs[${index}].value`]: value,
          activeState: `${input.name}: ${value}`
        })
      }
    })
  },

  changeNumberInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const value = Number(event.detail.value)
    this.player?.setInput(index, value, this.data.stateMachineNames[this.data.stateMachineIndex])
    this.setData({ [`inputs[${index}].value`]: value })
  },

  setCanvasTone(event) {
    this.setData({ canvasTone: event.currentTarget.dataset.tone })
  },

  getCanvasTouchPoint(touch) {
    if (!touch) return null
    const clientX = Number(touch.clientX)
    const clientY = Number(touch.clientY)
    const canvasLeft = Number(this.canvasRect?.left)
    const canvasTop = Number(this.canvasRect?.top)
    if (
      Number.isFinite(clientX)
      && Number.isFinite(clientY)
      && Number.isFinite(canvasLeft)
      && Number.isFinite(canvasTop)
    ) {
      return {
        x: clientX - canvasLeft,
        y: clientY - canvasTop
      }
    }
    const localX = Number(touch.x)
    const localY = Number(touch.y)
    return Number.isFinite(localX) && Number.isFinite(localY)
      ? { x: localX, y: localY }
      : null
  },

  canvasTouchStart(event) {
    const touch = event.touches[0]
    const point = this.getCanvasTouchPoint(touch)
    if (point) this.player?.pointer('down', point.x, point.y, touch.identifier || 0)
  },

  canvasTouchMove(event) {
    const touch = event.touches[0]
    const point = this.getCanvasTouchPoint(touch)
    if (point && !this.data.stageDragging) {
      this.player?.pointer('move', point.x, point.y, touch.identifier || 0)
    }
  },

  canvasTouchEnd(event) {
    const touch = event.changedTouches[0]
    const point = this.getCanvasTouchPoint(touch)
    if (!point) return
    const pointerId = touch.identifier || 0
    if (event.type === 'touchcancel') {
      this.player?.pointer('exit', point.x, point.y, pointerId)
      return
    }
    this.player?.pointer('up', point.x, point.y, pointerId)
    this.player?.pointer('exit', point.x, point.y, pointerId)
  },

  showSaveMenu() {
    this.setData({ activeState: '选择文件导出方式' })
    wx.showActionSheet({
      itemList: ['发送给好友', isDesktopWechat() ? '保存到电脑' : '保存到手机'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.shareFile()
        if (tapIndex === 1) this.saveFileToDevice()
      }
    })
  },

  showFileActionError(title, error) {
    if (isCancelError(error)) return
    console.error(title, error)
    wx.showModal({
      title,
      content: describeFileActionError(error, '请稍后重试'),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  shareFile() {
    sharePreparedFile(this.data.file.id, {
      success: () => wx.showToast({ title: '已打开发送面板', icon: 'success' }),
      fail: (error) => this.showFileActionError('发送失败', error)
    })
  },

  saveFileToDevice() {
    if (isDesktopWechat()) {
      savePreparedFileToDisk(this.data.file.id, {
        success: () => wx.showToast({ title: '已保存到电脑', icon: 'success' }),
        fail: (error) => this.showFileActionError('保存失败', error)
      })
      return
    }
    wx.showModal({
      title: '保存到手机',
      content: '微信暂不允许小程序把 .riv 直接写入系统文件管理器。请发送到“文件传输助手”，再从聊天文件中保存或用其他应用打开。',
      confirmText: '去发送',
      cancelText: '取消',
      success: ({ confirm }) => {
        if (confirm) this.shareFile()
      }
    })
  },

  retryNative() {
    this.disposePreview()
    this.pageVisible = true
    this.setData({ loading: true, error: '' }, () => this.startPreview())
  },

  formatSize
})
