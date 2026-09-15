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

function loadPlayerWithTimeout(player, bytes, timeoutMs) {
  let timeoutId = 0
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Rive 解析超时，请重试或换用较小的文件'))
    }, timeoutMs)
  })
  return Promise.race([player.load(bytes), timeout])
    .finally(() => clearTimeout(timeoutId))
}

function waitForLoadingPaint() {
  return new Promise((resolve) => {
    const finish = () => setTimeout(resolve, 16)
    if (typeof wx.nextTick === 'function') wx.nextTick(finish)
    else finish()
  })
}

module.exports = {
  formatTimelineTime,
  loadPlayerWithTimeout,
  sortTimelineNames,
  waitForLoadingPaint
}
