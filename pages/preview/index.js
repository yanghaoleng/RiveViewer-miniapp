const {
  getDesktopSplitUrl,
  getWindowInfo,
  supportsDesktopSplit
} = require('../../utils/desktop-split')
const {
  enableShareMenu,
  FRIEND_SHARE_IMAGE,
  HOME_PATH,
  SHARE_TITLE,
  TIMELINE_SHARE_IMAGE,
  TIMELINE_QUERY
} = require('../../utils/share')

function redirectToDesktopSplit(page, fileId) {
  if (!fileId || page.desktopSplitRedirecting) return false
  page.desktopSplitRedirecting = true
  page.selectComponent('#pagePreview')?.disposePreview?.()
  wx.reLaunch({
    url: getDesktopSplitUrl(fileId),
    fail: () => {
      page.desktopSplitRedirecting = false
    }
  })
  return true
}

Page({
  data: {
    fileId: ''
  },

  onLoad(options = {}) {
    const fileId = decodeURIComponent(options.id || '')
    if (fileId && supportsDesktopSplit(getWindowInfo())) {
      redirectToDesktopSplit(this, fileId)
      return
    }
    this.setData({ fileId })
    this.desktopWindowResizeHandler = (result) => {
      if (!this.data.fileId || !supportsDesktopSplit(result?.size || getWindowInfo())) return
      redirectToDesktopSplit(this, this.data.fileId)
    }
    if (typeof wx.onWindowResize === 'function') {
      wx.onWindowResize(this.desktopWindowResizeHandler)
    }
  },

  onShow() {
    enableShareMenu()
  },

  onUnload() {
    if (this.desktopWindowResizeHandler && typeof wx.offWindowResize === 'function') {
      wx.offWindowResize(this.desktopWindowResizeHandler)
    }
    this.desktopWindowResizeHandler = null
  },

  onShareAppMessage() {
    return {
      title: SHARE_TITLE,
      path: HOME_PATH,
      imageUrl: FRIEND_SHARE_IMAGE
    }
  },

  onShareTimeline() {
    return {
      title: SHARE_TITLE,
      query: TIMELINE_QUERY,
      imageUrl: TIMELINE_SHARE_IMAGE
    }
  }
})
