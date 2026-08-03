const SHARE_TITLE = 'Rive 预览台｜在微信中预览 Rive 动效'
const HOME_PATH = '/pages/index/index'

function enableShareMenu() {
  if (typeof wx.showShareMenu !== 'function') return
  const options = {
    withShareTicket: false
  }
  if (typeof wx.canIUse !== 'function' || wx.canIUse('showShareMenu.menus')) {
    options.menus = ['shareAppMessage', 'shareTimeline']
  }
  wx.showShareMenu({
    ...options,
    fail(error) {
      console.warn('无法开启完整分享菜单', error)
      if (options.menus) wx.showShareMenu({ withShareTicket: false })
    }
  })
}

function createShareAppMessage() {
  return {
    title: SHARE_TITLE,
    path: HOME_PATH
  }
}

function createShareTimeline() {
  return {
    title: SHARE_TITLE,
    query: 'shareLanding=1'
  }
}

function isShareLanding(options = {}) {
  return String(options.shareLanding || '') === '1'
}

function openShareLanding() {
  wx.reLaunch({ url: HOME_PATH })
}

module.exports = {
  createShareAppMessage,
  createShareTimeline,
  enableShareMenu,
  isShareLanding,
  openShareLanding
}
