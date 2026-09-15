const rivePolicy = require('../shared/rive-policy.js')

const MAX_AUDIO_SOURCE_BYTES = 8 * 1024 * 1024
const IOS_AUDIO_FRAME_INTERVAL = 1000 / 30
const IOS_AUDIO_PIXEL_RATIO_LIMIT = 1.5
const IOS_COMPLEX_FRAME_INTERVAL = 1000 / 24
const IOS_COMPLEX_PIXEL_RATIO_LIMIT = 1.25
const QUALITY_PROFILES = {
  performance: { frameInterval: 1000 / 30, pixelRatio: 1 },
  balanced: { frameInterval: 1000 / 45, pixelRatio: 1.5 },
  high: { frameInterval: 0, pixelRatio: 2 }
}

function getAudioBlockedReason(sourceSize, platformSupported) {
  if (!platformSupported) return '当前微信版本不支持声音'
  if (Math.max(0, Number(sourceSize) || 0) > MAX_AUDIO_SOURCE_BYTES) {
    return '大文件已启用性能保护'
  }
  return ''
}

function getPlaybackPerformanceProfile({
  hasAudio = false,
  isIOS = false,
  isComplexFile = false,
  pixelRatio = 1,
  qualityMode = ''
} = {}) {
  const isIOSAudio = Boolean(isIOS && hasAudio)
  const isIOSComplex = Boolean(isIOS && isComplexFile && !hasAudio)
  const qualityProfile = QUALITY_PROFILES[qualityMode] || null
  const requestedPixelRatio = qualityProfile
    ? Math.min(Math.max(1, Number(pixelRatio) || 1), qualityProfile.pixelRatio)
    : Math.max(1, Number(pixelRatio) || 1)
  const automaticFrameInterval = isIOSAudio
    ? IOS_AUDIO_FRAME_INTERVAL
    : (isIOSComplex ? IOS_COMPLEX_FRAME_INTERVAL : (isComplexFile ? 30 : 0))
  const automaticPixelRatio = isIOSAudio
    ? Math.min(requestedPixelRatio, IOS_AUDIO_PIXEL_RATIO_LIMIT)
    : (isIOSComplex
        ? Math.min(requestedPixelRatio, IOS_COMPLEX_PIXEL_RATIO_LIMIT)
        : (isComplexFile ? Math.min(requestedPixelRatio, 1.25) : requestedPixelRatio))
  return {
    frameInterval: Math.max(automaticFrameInterval, qualityProfile?.frameInterval || 0),
    pixelRatio: automaticPixelRatio
  }
}

function isComplexRiveFile({ sourceSize, artboardCount, animationCount, stateMachineCount }) {
  return sourceSize >= rivePolicy.complexity.sourceBytes
    || artboardCount >= rivePolicy.complexity.mini.artboards
    || animationCount >= rivePolicy.complexity.mini.animations
    || stateMachineCount >= rivePolicy.complexity.mini.stateMachines
}

module.exports = {
  getAudioBlockedReason,
  getPlaybackPerformanceProfile,
  IOS_AUDIO_FRAME_INTERVAL,
  IOS_AUDIO_PIXEL_RATIO_LIMIT,
  IOS_COMPLEX_FRAME_INTERVAL,
  IOS_COMPLEX_PIXEL_RATIO_LIMIT,
  isComplexRiveFile,
  MAX_AUDIO_SOURCE_BYTES,
  QUALITY_PROFILES
}
