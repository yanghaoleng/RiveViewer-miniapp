const {
  getAllFiles,
  getFileById,
  importTempFiles,
  readFile,
  removeFile,
  saveCover
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
  enableShareMenu
} = require('../../utils/share')

const AUTO_THUMBNAIL_SIZE_LIMIT = 2 * 1024 * 1024

Page({
  data: {
    files: [],
    importing: false,
    userFileCount: 0,
    expandedFileId: '',
    saveTargetLabel: isDesktopWechat() ? '保存到电脑' : '保存到手机'
  },

  onLoad() {
    enableShareMenu()
  },

  onShareAppMessage() {
    return createShareAppMessage()
  },

  onShareTimeline() {
    return createShareTimeline()
  },

  onShow() {
    this.pageVisible = true
    this.refreshFiles()
    this.scheduleMissingThumbnails()
  },

  onReady() {
    this.pageReady = true
    this.scheduleMissingThumbnails(500)
  },

  onHide() {
    this.pageVisible = false
    this.stopThumbnailGeneration()
  },

  onUnload() {
    this.pageVisible = false
    this.stopThumbnailGeneration()
  },

  refreshFiles() {
    const files = getAllFiles()
    this.setData({
      files,
      userFileCount: files.filter((file) => !file.builtin).length
    })
  },

  scheduleMissingThumbnails(delay = 700) {
    if (!this.pageReady || !this.pageVisible || this.thumbnailGenerationRunning) return
    clearTimeout(this.thumbnailTimer)
    this.thumbnailTimer = setTimeout(() => this.generateMissingThumbnails(), delay)
  },

  stopThumbnailGeneration() {
    clearTimeout(this.thumbnailTimer)
    clearTimeout(this.thumbnailFrameTimer)
    this.thumbnailGenerationToken = (this.thumbnailGenerationToken || 0) + 1
    this.thumbnailPlayer?.dispose()
    this.thumbnailPlayer = null
  },

  async generateMissingThumbnails() {
    if (!this.pageReady || !this.pageVisible || this.thumbnailGenerationRunning) return
    const missingFiles = getAllFiles()
      .filter((file) => !file.cover && file.size <= AUTO_THUMBNAIL_SIZE_LIMIT)
      .slice(0, 1)
    if (!missingFiles.length) return
    this.thumbnailGenerationRunning = true
    const token = (this.thumbnailGenerationToken || 0) + 1
    this.thumbnailGenerationToken = token

    try {
      const canvasInfo = await this.getThumbnailCanvas()
      for (const file of missingFiles) {
        if (token !== this.thumbnailGenerationToken || !this.pageVisible) break
        await this.generateThumbnail(file, canvasInfo, token)
      }
    } finally {
      this.thumbnailPlayer?.dispose()
      this.thumbnailPlayer = null
      this.thumbnailGenerationRunning = false
      if (this.pageVisible) this.scheduleMissingThumbnails(350)
    }
  },

  getThumbnailCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#thumbnailCanvas')
        .fields({ node: true, size: true })
        .exec((result) => {
          if (result[0]?.node) resolve(result[0])
          else reject(new Error('无法创建缩略图画布'))
        })
    })
  },

  waitForThumbnailFrame(duration = 120) {
    return new Promise((resolve) => {
      this.thumbnailFrameTimer = setTimeout(resolve, duration)
    })
  },

  exportThumbnail(canvas) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        quality: 0.86,
        destWidth: 360,
        destHeight: 240,
        success: (result) => resolve(result.tempFilePath),
        fail: reject
      }, this)
    })
  },

  async generateThumbnail(file, canvasInfo, token) {
    let bytes = null
    let player = null
    try {
      bytes = await readFile(file.path)
      if (token !== this.thumbnailGenerationToken || !this.pageVisible) return
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      player = new NativeRivePlayer({
        canvas: canvasInfo.node,
        width: canvasInfo.width,
        height: canvasInfo.height,
        pixelRatio: Math.min(windowInfo.pixelRatio || 1, 2)
      })
      this.thumbnailPlayer = player
      await player.load(bytes)
      player.setFit('cover')
      player.setAlignment('center')
      await this.waitForThumbnailFrame()
      if (
        token !== this.thumbnailGenerationToken ||
        !this.pageVisible ||
        !getFileById(file.id)
      ) return
      const tempFilePath = await this.exportThumbnail(canvasInfo.node)
      const cover = await saveCover(file.id, tempFilePath)
      const files = this.data.files.map((item) => (
        item.id === file.id ? { ...item, cover } : item
      ))
      this.setData({ files })
    } catch (error) {
      console.warn(`缩略图生成失败: ${file.name}`, error)
    } finally {
      player?.dispose()
      if (this.thumbnailPlayer === player) this.thumbnailPlayer = null
      bytes = null
    }
  },

  showImportMenu() {
    if (this.data.importing) return
    const canChooseSystemFile = typeof wx.miniapp?.chooseFile === 'function'
    const itemList = canChooseSystemFile
      ? ['从微信聊天文件导入', '从系统文件导入']
      : ['从微信聊天文件导入']
    wx.showActionSheet({
      alertText: canChooseSystemFile
        ? '支持多选 .riv 文件并逐个保存在本地'
        : '聊天文件支持多选 .riv 并逐个保存在本地',
      itemList,
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.chooseMessageFile()
        if (tapIndex === 1 && canChooseSystemFile) this.chooseSystemFile()
      }
    })
  },

  chooseMessageFile() {
    if (this.data.importing) return
    this.setData({ importing: true })
    wx.chooseMessageFile({
      count: 100,
      type: 'file',
      extension: ['riv'],
      success: (result) => this.importSelectedFiles(result.tempFiles, '微信聊天文件'),
      fail: (error) => {
        this.setData({ importing: false })
        if (!String(error.errMsg || '').includes('cancel')) {
          wx.showToast({ title: '文件选择失败', icon: 'none' })
        }
      }
    })
  },

  chooseSystemFile() {
    if (this.data.importing || typeof wx.miniapp?.chooseFile !== 'function') return
    this.setData({ importing: true })
    wx.miniapp.chooseFile({
      allowsMultipleSelection: true,
      success: (result) => this.importSelectedFiles(
        result.tempFiles || result.files,
        '系统文件'
      ),
      fail: (error) => {
        this.setData({ importing: false })
        if (!String(error.errMsg || '').includes('cancel')) {
          wx.showToast({ title: '系统文件选择失败', icon: 'none' })
        }
      }
    })
  },

  async importSelectedFiles(tempFiles, source) {
    const selectedFiles = Array.isArray(tempFiles) ? tempFiles.filter(Boolean) : []
    try {
      if (!selectedFiles.length) throw new Error('没有选择文件')
      wx.showLoading({ title: `导入 0/${selectedFiles.length}`, mask: true })
      const { imported, failures } = await importTempFiles(
        selectedFiles,
        source,
        ({ current, total }) => {
          wx.showLoading({ title: `导入 ${current}/${total}`, mask: true })
        }
      )
      wx.hideLoading()
      this.refreshFiles()
      if (!imported.length) {
        const firstFailure = failures[0]
        throw new Error(firstFailure?.message || '所选文件均未能导入')
      }
      if (failures.length) {
        wx.showModal({
          title: '部分文件未导入',
          content: `已导入 ${imported.length} 个，失败 ${failures.length} 个。${failures[0].name}：${failures[0].message}`,
          showCancel: false
        })
      } else {
        wx.showToast({
          title: imported.length === 1 ? '已导入' : `已导入${imported.length}个`,
          icon: 'success'
        })
      }
      if (imported.length === 1 && selectedFiles.length === 1) {
        this.openById(imported[0].id)
      } else {
        this.scheduleMissingThumbnails(900)
      }
    } catch (error) {
      wx.hideLoading()
      wx.showModal({
        title: '无法导入',
        content: error.message || error.errMsg || '请确认文件可读取',
        showCancel: false
      })
    } finally {
      this.setData({ importing: false })
    }
  },

  openFile(event) {
    this.setData({ expandedFileId: '' })
    const id = event.currentTarget.dataset.id
    const index = Number(event.currentTarget.dataset.index)
    const file = this.data.files[index]
    if (!file || file.id !== id || !file.cover) {
      this.openById(id)
      return
    }
    this.openWithCoverTransition(file, index)
  },

  openWithCoverTransition(file, index) {
    if (this.transitioningFileId) return
    this.transitioningFileId = file.id
    wx.createSelectorQuery()
      .selectAll('.file-cover')
      .boundingClientRect((rects) => {
        const rect = rects?.[index]
        if (rect?.width && rect?.height) {
          getApp().globalData.pendingPreviewTransition = {
            fileId: file.id,
            cover: file.cover,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }
          }
        }
        wx.navigateTo({
          url: `/pages/preview/index?id=${encodeURIComponent(file.id)}`,
          animationType: 'none',
          animationDuration: 0,
          fail: () => {
            if (getApp().globalData.pendingPreviewTransition?.fileId === file.id) {
              getApp().globalData.pendingPreviewTransition = null
            }
          },
          complete: () => {
            this.transitioningFileId = ''
          }
        })
      })
      .exec()
  },

  toggleFileMenu(event) {
    const id = event.currentTarget.dataset.id
    this.setData({
      expandedFileId: this.data.expandedFileId === id ? '' : id
    })
  },

  openById(id) {
    wx.navigateTo({
      url: `/pages/preview/index?id=${encodeURIComponent(id)}`
    })
  },

  copyAuthorWechat() {
    wx.setClipboardData({
      data: 'yanghaoeleng',
      success: () => {
        wx.showModal({
          title: '微信号已复制',
          content: 'yanghaoeleng\n请打开微信“添加朋友”粘贴搜索。',
          showCancel: false,
          confirmText: '知道了'
        })
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请手动输入', icon: 'none' })
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

  saveToDevice(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ expandedFileId: '' })
    if (isDesktopWechat()) {
      savePreparedFileToDisk(id, {
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
        if (confirm) this.shareFileById(id)
      }
    })
  },

  shareFileById(id) {
    sharePreparedFile(id, {
      success: () => wx.showToast({ title: '已打开发送面板', icon: 'success' }),
      fail: (error) => this.showFileActionError('发送失败', error)
    })
  },

  shareFile(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ expandedFileId: '' })
    this.shareFileById(id)
  },

  deleteFile(event) {
    const id = event.currentTarget.dataset.id
    const file = this.data.files.find((item) => item.id === id)
    if (!file || file.builtin) return
    this.setData({ expandedFileId: '' })
    wx.showModal({
      title: '删除本地文件',
      content: `将从小程序本地存储中删除“${file.name}”。`,
      confirmText: '删除',
      confirmColor: '#b94040',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await removeFile(id)
          this.refreshFiles()
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
