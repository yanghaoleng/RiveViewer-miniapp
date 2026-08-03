let runtimePromise = null
let animationCanvas = null
let RiveFactory = null
let embeddedImageSequence = 0

function defineRuntimeGlobal(root, key, value) {
  try {
    root[key] = value
  } catch (error) {
    Object.defineProperty(root, key, {
      value,
      configurable: true,
      writable: true
    })
  }
}

function installImageShims(root) {
  if (typeof root.Image === 'undefined') {
    defineRuntimeGlobal(root, 'Image', function MiniProgramImage() {
      if (!animationCanvas?.createImage) {
        throw new Error('当前 Canvas 不支持嵌入图片资源')
      }
      return animationCanvas.createImage()
    })
  }

  const needsObjectUrlShim = (
    typeof root.Blob === 'undefined'
    || typeof root.URL?.createObjectURL !== 'function'
  )
  if (needsObjectUrlShim) {
    defineRuntimeGlobal(root, 'Blob', class MiniProgramBlob {
      constructor(parts = [], options = {}) {
        this.parts = parts
        this.type = options.type || 'application/octet-stream'
      }
    })
  }

  const urlApi = root.URL || {}
  if (needsObjectUrlShim) {
    const createObjectURL = (blob) => {
      const part = blob?.parts?.[0]
      if (!part) throw new Error('嵌入图片数据为空')
      const bytes = part instanceof Uint8Array
        ? part
        : new Uint8Array(part)
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      const filePath = `${wx.env.USER_DATA_PATH}/rive-embedded-${Date.now()}-${embeddedImageSequence += 1}.png`
      wx.getFileSystemManager().writeFileSync(filePath, data)
      return filePath
    }
    const revokeObjectURL = (filePath) => {
      if (!String(filePath || '').startsWith(wx.env.USER_DATA_PATH)) return
      try {
        wx.getFileSystemManager().unlinkSync(filePath)
      } catch (error) {}
    }
    try {
      urlApi.createObjectURL = createObjectURL
      urlApi.revokeObjectURL = revokeObjectURL
    } catch (error) {
      Object.defineProperties(urlApi, {
        createObjectURL: { value: createObjectURL, configurable: true },
        revokeObjectURL: { value: revokeObjectURL, configurable: true }
      })
    }
  }
  if (!root.URL) defineRuntimeGlobal(root, 'URL', urlApi)
}

function installRuntimeShims(canvas) {
  animationCanvas = canvas
  const root = typeof globalThis !== 'undefined' ? globalThis : global

  if (typeof root.document === 'undefined') {
    root.document = {
      currentScript: null,
      createElement() {
        return {
          style: {},
          getContext() {
            return null
          }
        }
      }
    }
  }

  if (typeof root.navigator === 'undefined') {
    try {
      root.navigator = { userAgent: 'WeChat MiniProgram' }
    } catch (error) {
      Object.defineProperty(root, 'navigator', {
        value: { userAgent: 'WeChat MiniProgram' },
        configurable: true
      })
    }
  }

  if (typeof root.performance === 'undefined' || typeof root.performance.now !== 'function') {
    const startedAt = Date.now()
    const performanceShim = {
      now() {
        return Date.now() - startedAt
      },
      mark() {},
      measure() {},
      clearMarks() {},
      clearMeasures() {}
    }

    try {
      root.performance = performanceShim
    } catch (error) {
      Object.defineProperty(root, 'performance', {
        value: performanceShim,
        configurable: true
      })
    }
  }

  installImageShims(root)

  root.requestAnimationFrame = (callback) => animationCanvas.requestAnimationFrame(callback)
  root.cancelAnimationFrame = (requestId) => animationCanvas.cancelAnimationFrame(requestId)

  if (typeof root.WebAssembly === 'undefined') {
    root.WebAssembly = {
      RuntimeError: Error,
      CompileError: Error
    }
  }
}

function getRuntime(canvas) {
  installRuntimeShims(canvas)
  if (runtimePromise) return runtimePromise
  RiveFactory = RiveFactory || require('../vendor/rive/canvas_advanced')
  const root = typeof globalThis !== 'undefined' ? globalThis : global

  runtimePromise = new Promise((resolve, reject) => {
    if (typeof WXWebAssembly === 'undefined') {
      reject(new Error('当前基础库不支持 WXWebAssembly'))
      return
    }

    RiveFactory({
      document: root.document,
      navigator: root.navigator,
      performance: root.performance,
      requestAnimationFrame: root.requestAnimationFrame,
      cancelAnimationFrame: root.cancelAnimationFrame,
      Path2D: function MiniProgramPath2D() {
        return canvas.createPath2D()
      },
      Image: root.Image,
      Blob: root.Blob,
      URL: root.URL,
      instantiateWasm(imports, receiveInstance) {
        WXWebAssembly.instantiate('vendor/rive/rive.wasm.br', imports)
          .then((result) => receiveInstance(result.instance || result))
          .catch(reject)
        return {}
      }
    }).then(resolve, reject)
  })

  runtimePromise.catch(() => {
    runtimePromise = null
  })

  return runtimePromise
}

function fitLabel(key) {
  const labels = {
    contain: '完整显示',
    cover: '铺满画布',
    fill: '拉伸填充',
    fitWidth: '适应宽度',
    fitHeight: '适应高度'
  }
  return labels[key] || key
}

function alignmentLabel(key) {
  const labels = {
    topCenter: '顶部',
    center: '居中',
    bottomCenter: '底部'
  }
  return labels[key] || key
}

function getAnimationDuration(definition) {
  const duration = Number(definition?.duration) || 0
  const fps = Number(definition?.fps) || 0
  const workStart = Number(definition?.workStart)
  const workEnd = Number(definition?.workEnd)
  if (
    definition?.enableWorkArea
    && fps > 0
    && Number.isFinite(workStart)
    && Number.isFinite(workEnd)
    && workEnd > workStart
  ) {
    return (workEnd - workStart) / fps
  }
  return fps > 0 ? duration / fps : duration
}

class NativeRivePlayer {
  constructor(options) {
    this.canvas = options.canvas
    this.width = options.width
    this.height = options.height
    this.pixelRatio = options.pixelRatio || 1
    this.onMetadata = options.onMetadata || (() => {})
    this.onStateChange = options.onStateChange || (() => {})
    this.onPlaybackChange = options.onPlaybackChange || (() => {})
    this.onTimelineProgress = options.onTimelineProgress || (() => {})
    this.onFirstFrame = options.onFirstFrame || (() => {})
    this.onError = options.onError || (() => {})
    this.fitKey = 'cover'
    this.alignmentKey = 'center'
    this.speed = 1
    this.playing = true
    this.lastTime = 0
    this.frameRequest = 0
    this.disposed = false
    this.viewMatrix = null
    this.inputRefs = []
    this.boundViewModelInstances = []
    this.metadata = null
    this.selectedStateMachineName = ''
    this.sequenceNames = []
    this.sequenceIndex = -1
    this.sequenceElapsed = 0
    this.sequenceMode = false
    this.sequenceFinished = false
    this.sequenceHasOut = false
    this.lastProgressEmitAt = 0
    this.animationElapsed = 0
  }

  async load(arrayBuffer) {
    try {
      this.runtime = await getRuntime(this.canvas)
      if (this.disposed) return false
      animationCanvas = this.canvas
      this.canvas.width = Math.max(1, Math.round(this.width * this.pixelRatio))
      this.canvas.height = Math.max(1, Math.round(this.height * this.pixelRatio))
      this.renderer = this.runtime.makeRenderer(this.canvas)
      const file = await this.runtime.load(new Uint8Array(arrayBuffer), undefined, false)
      if (this.disposed) {
        file?.unref?.()
        this.renderer?.delete?.()
        this.renderer = null
        return false
      }
      this.file = file
      this.metadata = this.inspectFile()
      this.activateArtboard(this.metadata.artboards[0].name)
      if (!this.activeStateMachineHasListeners()) this.playDefaultSequence()
      this.onMetadata(this.getPublicMetadata())
      this.frameRequest = this.runtime.requestAnimationFrame((time) => this.render(time))
      return true
    } catch (error) {
      if (this.disposed) return false
      this.renderer?.delete?.()
      this.renderer = null
      this.onError(error)
      throw error
    }
  }

  inspectFile() {
    const artboards = []
    const count = this.file.artboardCount()
    for (let index = 0; index < count; index += 1) {
      const artboard = this.file.artboardByIndex(index)
      const animations = []
      const stateMachines = []

      for (let animationIndex = 0; animationIndex < artboard.animationCount(); animationIndex += 1) {
        animations.push(artboard.animationByIndex(animationIndex).name)
      }

      for (let machineIndex = 0; machineIndex < artboard.stateMachineCount(); machineIndex += 1) {
        const definition = artboard.stateMachineByIndex(machineIndex)
        const inputs = []
        if (index === 0 && machineIndex === 0) {
          const instance = new this.runtime.StateMachineInstance(definition, artboard)
          for (let inputIndex = 0; inputIndex < instance.inputCount(); inputIndex += 1) {
            const input = this.castInput(instance.input(inputIndex))
            inputs.push(this.describeInput(input, inputIndex))
          }
          instance.delete()
        }
        stateMachines.push({ name: definition.name, inputs })
      }

      const bounds = artboard.bounds
      artboards.push({
        name: artboard.name,
        width: Math.round(bounds.maxX - bounds.minX),
        height: Math.round(bounds.maxY - bounds.minY),
        animations,
        stateMachines
      })
      artboard.delete()
    }
    return { artboards }
  }

  describeInput(input, index) {
    let type = 'number'
    if (input.type === this.runtime.SMIInput.bool) type = 'boolean'
    if (input.type === this.runtime.SMIInput.trigger) type = 'trigger'
    return {
      index,
      name: input.name,
      type,
      value: type === 'trigger' ? null : input.value
    }
  }

  castInput(input) {
    if (input.type === this.runtime.SMIInput.bool) return input.asBool()
    if (input.type === this.runtime.SMIInput.trigger) return input.asTrigger()
    return input.asNumber()
  }

  activateArtboard(name, machineName) {
    this.clearSequence()
    this.disposeActiveInstances()
    this.artboard = this.file.artboardByName(name)
    this.activeArtboardName = this.artboard.name
    const artboardMeta = this.metadata.artboards.find((item) => item.name === this.activeArtboardName)
    const selectedMachine = machineName || artboardMeta.stateMachines[0]?.name || ''
    this.selectedStateMachineName = selectedMachine
    this.activeStateMachineName = selectedMachine

    if (selectedMachine) {
      const definition = this.artboard.stateMachineByName(selectedMachine)
      this.stateMachine = new this.runtime.StateMachineInstance(definition, this.artboard)
      this.inputRefs = Array.from({ length: this.stateMachine.inputCount() }, (_, index) => (
        this.castInput(this.stateMachine.input(index))
      ))
    } else if (artboardMeta.animations.length) {
      const definition = this.artboard.animationByName(artboardMeta.animations[0])
      this.animation = new this.runtime.LinearAnimationInstance(definition, this.artboard)
      this.animationDuration = getAnimationDuration(definition)
      this.animationElapsed = 0
      this.activeAnimationName = artboardMeta.animations[0]
    }

    this.bindDefaultViewModels()
    this.lastTime = 0
    this.playing = true
    this.updateViewMatrix()
    if (this.stateMachine) this.advanceStateMachine(0)
    this.onTimelineProgress({
      animation: '',
      progress: 0,
      time: 0,
      duration: 0,
      isPlaying: true
    })
  }

  selectArtboard(name) {
    this.activateArtboard(name)
    if (!this.activeStateMachineHasListeners()) this.playDefaultSequence()
    this.onMetadata(this.getPublicMetadata())
  }

  selectStateMachine(name) {
    this.activateArtboard(this.activeArtboardName, name)
    this.onMetadata(this.getPublicMetadata())
  }

  selectAnimation(name) {
    this.clearSequence()
    this.disposeActiveInstances()
    this.artboard = this.file.artboardByName(this.activeArtboardName)
    const definition = this.artboard.animationByName(name)
    this.animation = new this.runtime.LinearAnimationInstance(definition, this.artboard)
    this.animationDuration = getAnimationDuration(definition)
    this.animationElapsed = 0
    this.activeAnimationName = name
    this.activeStateMachineName = ''
    this.bindDefaultViewModels()
    this.lastTime = 0
    this.playing = true
    this.updateViewMatrix()
    this.onPlaybackChange({
      isPlaying: true,
      activeState: `播放 ${name}`,
      animation: name
    })
    this.emitTimelineProgress(true)
    this.onMetadata(this.getPublicMetadata())
  }

  clearSequence() {
    this.sequenceNames = []
    this.sequenceIndex = -1
    this.sequenceElapsed = 0
    this.sequenceMode = false
    this.sequenceFinished = false
    this.sequenceHasOut = false
  }

  getDefaultSequence(animationNames) {
    const findName = (target) => animationNames.find((name) => name.trim().toLowerCase() === target)
    const intro = findName('in')
    const idle = findName('idle')
    const outro = findName('out')
    return [intro, idle, outro].filter(Boolean)
  }

  playDefaultSequence() {
    const artboardMeta = this.metadata?.artboards.find((item) => item.name === this.activeArtboardName)
    const sequenceNames = this.getDefaultSequence(artboardMeta?.animations || [])
    if (!sequenceNames.length) return false
    this.sequenceNames = sequenceNames
    this.sequenceIndex = 0
    this.sequenceElapsed = 0
    this.sequenceMode = true
    this.sequenceFinished = false
    this.sequenceHasOut = sequenceNames.some((name) => name.trim().toLowerCase() === 'out')
    this.activateSequenceStep(0)
    return true
  }

  activeStateMachineHasListeners() {
    if (!this.stateMachine || typeof this.runtime?.hasListeners !== 'function') return false
    try {
      return Boolean(this.runtime.hasListeners(this.stateMachine))
    } catch {
      return false
    }
  }

  bindDefaultViewModels() {
    const target = this.stateMachine || this.artboard
    if (!target?.bind) return
    const viewModelInstances = []
    try {
      const viewModel = this.file.defaultArtboardViewModel?.(this.artboard)
      const viewModelInstance = viewModel?.defaultInstance?.()
      if (viewModelInstance) {
        viewModelInstances.push(viewModelInstance)
      }
      if (viewModelInstance && target.setViewModelInstance) {
        target.setViewModelInstance(viewModelInstance)
      }

      const globalNames = this.file.globalViewModelNames?.() || []
      globalNames.forEach((name) => {
        const globalInstance = this.file.viewModelByName?.(name)?.defaultInstance?.()
        if (!globalInstance) return
        viewModelInstances.push(globalInstance)
        target.setGlobalViewModelInstance?.(name, globalInstance)
      })
      target.bind()
      this.boundViewModelInstances = viewModelInstances
    } catch (error) {
      viewModelInstances.forEach((instance) => instance?.unref?.())
      console.warn('Rive View Model 自动绑定失败', error)
    }
  }

  activateSequenceStep(index) {
    const name = this.sequenceNames[index]
    if (!name) return
    this.disposeActiveInstances()
    this.artboard = this.file.artboardByName(this.activeArtboardName)
    const definition = this.artboard.animationByName(name)
    this.animation = new this.runtime.LinearAnimationInstance(definition, this.artboard)
    this.animationDuration = getAnimationDuration(definition)
    this.animationElapsed = 0
    this.activeAnimationName = name
    this.activeStateMachineName = ''
    this.bindDefaultViewModels()
    this.sequenceIndex = index
    this.sequenceElapsed = 0
    this.lastTime = 0
    this.playing = true
    this.updateViewMatrix()
    this.onPlaybackChange({
      isPlaying: true,
      activeState: `播放 ${name}`,
      animation: name
    })
    this.emitTimelineProgress(true)
  }

  emitTimelineProgress(force = false) {
    if (!this.animation) {
      if (force) {
        this.onTimelineProgress({
          animation: '',
          progress: 0,
          time: 0,
          duration: 0,
          isPlaying: this.playing
        })
      }
      return
    }
    const now = Date.now()
    if (!force && now - this.lastProgressEmitAt < 90) return
    this.lastProgressEmitAt = now
    const duration = this.animationDuration || 0
    const isLoopingIdle = this.activeAnimationName.trim().toLowerCase() === 'idle'
      && (!this.sequenceMode || !this.sequenceHasOut)
    const time = duration > 0
      ? (isLoopingIdle
          ? this.animationElapsed % duration
          : Math.min(this.animationElapsed, duration))
      : Math.max(0, this.animationElapsed)
    const progress = duration > 0
      ? Math.max(0, Math.min(100, (time / duration) * 100))
      : 0
    this.onTimelineProgress({
      animation: this.activeAnimationName,
      progress,
      time,
      duration,
      isPlaying: this.playing
    })
  }

  advanceSequence(elapsed) {
    if (!this.sequenceMode || !this.animation) return
    this.sequenceElapsed += elapsed
    const duration = this.animationDuration || 0
    const completed = Boolean(this.animation.didLoop) || (duration > 0 && this.sequenceElapsed >= duration)
    if (!completed) return

    const activeName = this.sequenceNames[this.sequenceIndex] || ''
    const isIdle = activeName.trim().toLowerCase() === 'idle'
    const nextIndex = this.sequenceIndex + 1
    if (isIdle && !this.sequenceHasOut) {
      this.sequenceElapsed = 0
      return
    }
    if (nextIndex < this.sequenceNames.length) {
      this.activateSequenceStep(nextIndex)
      return
    }
    this.playing = false
    this.sequenceFinished = true
    this.onTimelineProgress({
      animation: activeName,
      progress: 100,
      time: duration,
      duration,
      isPlaying: false
    })
    this.onPlaybackChange({
      isPlaying: false,
      activeState: `${activeName} 播放完成`,
      animation: activeName
    })
  }

  getPublicMetadata() {
    const artboard = this.metadata.artboards.find((item) => item.name === this.activeArtboardName)
    const selectedMachine = artboard.stateMachines.find(
      (item) => item.name === this.selectedStateMachineName
    ) || artboard.stateMachines[0]
    const inputs = this.inputRefs.length
      ? this.inputRefs.map((input, index) => this.describeInput(input, index))
      : (selectedMachine?.inputs || [])
    return {
      artboards: this.metadata.artboards,
      activeArtboard: this.activeArtboardName,
      activeStateMachine: selectedMachine?.name || '',
      activeAnimation: this.activeAnimationName || '',
      width: artboard.width,
      height: artboard.height,
      animations: artboard.animations,
      stateMachines: artboard.stateMachines,
      inputs,
      fitLabel: fitLabel(this.fitKey),
      alignmentLabel: alignmentLabel(this.alignmentKey)
    }
  }

  updateViewMatrix() {
    if (!this.runtime || !this.artboard) return
    if (this.viewMatrix?.delete) this.viewMatrix.delete()
    this.viewMatrix = this.runtime.computeAlignment(
      this.runtime.Fit[this.fitKey],
      this.runtime.Alignment[this.alignmentKey],
      {
        minX: 0,
        minY: 0,
        maxX: this.width,
        maxY: this.height
      },
      this.artboard.bounds
    )
  }

  setFit(key) {
    if (!this.runtime.Fit[key] && this.runtime.Fit[key] !== 0) return
    this.fitKey = key
    this.updateViewMatrix()
  }

  setAlignment(key) {
    if (!this.runtime.Alignment[key]) return
    this.alignmentKey = key
    this.updateViewMatrix()
  }

  resize(width, height) {
    const nextWidth = Math.max(1, Number(width) || this.width)
    const nextHeight = Math.max(1, Number(height) || this.height)
    if (nextWidth === this.width && nextHeight === this.height) return
    this.width = nextWidth
    this.height = nextHeight
    this.canvas.width = Math.max(1, Math.round(nextWidth * this.pixelRatio))
    this.canvas.height = Math.max(1, Math.round(nextHeight * this.pixelRatio))
    this.updateViewMatrix()
  }

  setSpeed(value) {
    this.speed = Math.max(0.1, Math.min(8, Number(value) || 1))
  }

  play() {
    if (this.sequenceMode && this.sequenceFinished) {
      this.playDefaultSequence()
      return
    }
    this.playing = true
    this.lastTime = 0
    this.onPlaybackChange({
      isPlaying: true,
      activeState: this.activeAnimationName ? `播放 ${this.activeAnimationName}` : '正在播放'
    })
  }

  pause() {
    this.playing = false
    this.onPlaybackChange({ isPlaying: false, activeState: '已暂停' })
  }

  stop() {
    this.activateArtboard(this.activeArtboardName, this.activeStateMachineName)
    this.playing = false
  }

  reset() {
    this.activateArtboard(this.activeArtboardName, this.selectedStateMachineName)
    if (!this.activeStateMachineHasListeners()) this.playDefaultSequence()
    this.onPlaybackChange({ isPlaying: true, activeState: '已重置' })
  }

  ensureStateMachine(machineName) {
    const targetName = machineName || this.selectedStateMachineName
    if (!targetName) return false
    if (!this.stateMachine || this.activeStateMachineName !== targetName) {
      this.activateArtboard(this.activeArtboardName, targetName)
      this.onMetadata(this.getPublicMetadata())
    }
    return true
  }

  setInput(index, value, machineName) {
    if (!this.ensureStateMachine(machineName)) return
    const input = this.inputRefs[index]
    if (!input) return
    input.value = value
    this.advanceStateMachine(0)
  }

  fireInput(index, machineName) {
    if (!this.ensureStateMachine(machineName)) return
    const input = this.inputRefs[index]
    if (!input) return
    input.fire()
    const changedStates = this.advanceStateMachine(0)
    const enteredOnlyUnnamedStates = changedStates.length > 0
      && changedStates.every((name) => !String(name || '').trim())
    const fallbackAnimation = enteredOnlyUnnamedStates
      ? this.metadata?.artboards
          .find((item) => item.name === this.activeArtboardName)
          ?.animations.find((name) => (
            name.trim().toLowerCase() === input.name.trim().toLowerCase()
          ))
      : ''
    if (fallbackAnimation) {
      this.selectAnimation(fallbackAnimation)
      return { fallbackAnimation }
    }
    this.play()
    return { fallbackAnimation: '' }
  }

  pointer(type, x, y, pointerId = 0) {
    if (!this.stateMachine && type === 'down' && this.selectedStateMachineName) {
      this.ensureStateMachine(this.selectedStateMachineName)
    }
    if (!this.stateMachine || !this.viewMatrix) return
    const matrix = this.viewMatrix
    const canvasX = x
    const canvasY = y
    const determinant = matrix.xx * matrix.yy - matrix.yx * matrix.xy
    if (!determinant) return
    const translatedX = canvasX - matrix.tx
    const translatedY = canvasY - matrix.ty
    const artboardX = (matrix.yy * translatedX - matrix.yx * translatedY) / determinant
    const artboardY = (-matrix.xy * translatedX + matrix.xx * translatedY) / determinant
    const method = {
      down: 'pointerDown',
      move: 'pointerMove',
      up: 'pointerUp',
      exit: 'pointerExit'
    }[type]
    if (method && this.stateMachine[method]) {
      this.stateMachine[method](artboardX, artboardY, pointerId)
      this.advanceStateMachine(0)
    }
  }

  advanceStateMachine(elapsed) {
    if (!this.stateMachine) return []
    this.stateMachine.advance(elapsed)
    this.artboard?.advance(elapsed)
    const changed = this.stateMachine.stateChangedCount()
    const states = []
    if (changed > 0) {
      for (let index = 0; index < changed; index += 1) {
        states.push(this.stateMachine.stateChangedNameByIndex(index))
      }
      const meaningfulStates = states.filter((name) => String(name || '').trim())
      if (meaningfulStates.length) this.onStateChange(meaningfulStates)
    }
    return states
  }

  render(time) {
    if (this.disposed) return
    const elapsed = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0
    this.lastTime = time
    this.renderer.clear()

    if (this.playing) {
      const scaledElapsed = elapsed * this.speed
      if (this.stateMachine) {
        this.advanceStateMachine(scaledElapsed)
      } else {
        if (this.animation) {
          this.animation.advance(scaledElapsed)
          this.animation.apply(1)
          this.animationElapsed += scaledElapsed
        }
        this.artboard.advance(scaledElapsed)
      }
      this.emitTimelineProgress()
      this.advanceSequence(scaledElapsed)
    }

    this.renderer.save()
    this.renderer.align(
      this.runtime.Fit[this.fitKey],
      this.runtime.Alignment[this.alignmentKey],
      {
        minX: 0,
        minY: 0,
        maxX: this.canvas.width,
        maxY: this.canvas.height
      },
      this.artboard.bounds
    )
    this.artboard.draw(this.renderer)
    this.renderer.restore()
    if (this.renderer.flush) this.renderer.flush()
    if (!this.firstFrameRendered) {
      this.firstFrameRendered = true
      this.onFirstFrame()
    }
    this.frameRequest = this.runtime.requestAnimationFrame((nextTime) => this.render(nextTime))
  }

  disposeActiveInstances() {
    if (this.stateMachine?.delete) this.stateMachine.delete()
    if (this.animation?.delete) this.animation.delete()
    if (this.artboard?.delete) this.artboard.delete()
    this.boundViewModelInstances.forEach((instance) => instance?.unref?.())
    this.stateMachine = null
    this.animation = null
    this.animationDuration = 0
    this.animationElapsed = 0
    this.artboard = null
    this.inputRefs = []
    this.boundViewModelInstances = []
    this.activeAnimationName = ''
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.frameRequest && this.runtime) {
      this.runtime.cancelAnimationFrame(this.frameRequest)
    }
    this.disposeActiveInstances()
    if (this.viewMatrix?.delete) this.viewMatrix.delete()
    if (this.renderer?.delete) this.renderer.delete()
    if (this.file?.unref) this.file.unref()
    this.viewMatrix = null
    this.renderer = null
    this.file = null
  }
}

module.exports = {
  NativeRivePlayer,
  getRuntime
}
