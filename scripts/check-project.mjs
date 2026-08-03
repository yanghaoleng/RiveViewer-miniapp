import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { brotliDecompress } from 'node:zlib'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const decompressBrotli = promisify(brotliDecompress)
const packageManifest = JSON.parse(
  await fs.readFile(path.join(root, 'package.json'), 'utf8')
)
const appManifest = JSON.parse(
  await fs.readFile(path.join(root, 'app.json'), 'utf8')
)
const requiredFiles = [
  'app.json',
  'project.config.json',
  'vendor/rive/canvas_advanced.js',
  'vendor/rive/rive.wasm.br',
  'assets/samples/guide.riv',
  'assets/samples/question.riv',
  'assets/samples/guide.js',
  'assets/samples/question.js',
  'pages/index/index.js',
  'pages/preview/index.js',
  'utils/share.js',
  'scripts/verify-rive-interactions.mjs'
]

if (
  packageManifest.dependencies?.['@rive-app/canvas-advanced'] !== '2.39.1'
  || packageManifest.dependencies?.['@rive-app/canvas-advanced-lite']
) {
  throw new Error('必须使用完整 Canvas 运行时，Lite 缺少 Rive Layout 等能力')
}

for (const relativePath of requiredFiles) {
  await fs.access(path.join(root, relativePath))
}

for (const relativePath of ['app.json', 'project.config.json']) {
  JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'))
}

try {
  JSON.parse(await fs.readFile(path.join(root, 'project.private.config.json'), 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

for (const relativePath of [
  'h5',
  'pages/h5-preview',
  'scripts/h5-server.mjs',
  'assets/icons/browser.svg'
]) {
  try {
    await fs.access(path.join(root, relativePath))
    throw new Error(`${relativePath} 已废弃但仍存在`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

for (const relativePath of ['assets/samples/guide.riv', 'assets/samples/question.riv']) {
  const bytes = await fs.readFile(path.join(root, relativePath))
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIVE') {
    throw new Error(`${relativePath} 不是有效的 Rive 文件`)
  }
}

const visibleFiles = [
  'pages/index/index.wxml',
  'pages/preview/index.wxml'
]
for (const relativePath of visibleFiles) {
  const source = await fs.readFile(path.join(root, relativePath), 'utf8')
  if (/[\u2013\u2014]/.test(source)) {
    throw new Error(`${relativePath} 含有不允许的长破折号`)
  }
}

const previewMarkup = await fs.readFile(path.join(root, 'pages/preview/index.wxml'), 'utf8')
const previewLogic = await fs.readFile(path.join(root, 'pages/preview/index.js'), 'utf8')
const homeLogic = await fs.readFile(path.join(root, 'pages/index/index.js'), 'utf8')
const appLogic = await fs.readFile(path.join(root, 'app.js'), 'utf8')
const libraryLogic = await fs.readFile(path.join(root, 'utils/library.js'), 'utf8')
const shareLogic = await fs.readFile(path.join(root, 'utils/share.js'), 'utf8')
const nativeRuntime = await fs.readFile(path.join(root, 'utils/rive-native.js'), 'utf8')
const nativeVendor = await fs.readFile(path.join(root, 'vendor/rive/canvas_advanced.js'), 'utf8')
const vendorScript = await fs.readFile(path.join(root, 'scripts/vendor-rive.mjs'), 'utf8')

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

const packageWasm = await fs.readFile(
  path.join(root, 'node_modules/@rive-app/canvas-advanced/rive.wasm')
)
const nativeCompressedWasm = await fs.readFile(path.join(root, 'vendor/rive/rive.wasm.br'))

if (sha256(packageWasm) !== sha256(await decompressBrotli(nativeCompressedWasm))) {
  throw new Error('原生 Brotli WASM 与依赖中的 Rive 运行时未保持一致')
}

if (
  appManifest.pages.some((page) => /h5/i.test(page))
  || packageManifest.scripts?.['dev:h5']
  || /h5Preview|switchToH5|retryWithH5|h5Origin|web-view|h5-preview/i.test(
    appLogic + previewLogic + previewMarkup
  )
) {
  throw new Error('项目中仍有废弃的 H5 预览入口或配置')
}

if (/pageResize(Start|Move|End)/.test(previewMarkup + previewLogic)) {
  throw new Error('画布缩放仍绑定在页面手势上')
}
if (!/class="stage-resizer[\s\S]*bindtouchstart="stageResizeStart"/.test(previewMarkup)) {
  throw new Error('原生画布缩放手柄缺少拖动绑定')
}
if (
  !/toggleStageViewMode/.test(previewLogic)
  || !/stageViewMode:\s*'auto'/.test(previewLogic)
  || !/双击切换/.test(previewMarkup)
) {
  throw new Error('画板手柄缺少自适应与参数全览双击切换')
}
if (!/count:\s*100/.test(homeLogic) || !/importSelectedFiles/.test(homeLogic)) {
  throw new Error('微信聊天文件多选导入未启用')
}
if (
  !/showShareMenu/.test(shareLogic)
  || !/shareAppMessage/.test(shareLogic)
  || !/shareTimeline/.test(shareLogic)
  || ![homeLogic, previewLogic].every((source) => (
    /onShareAppMessage\(\)/.test(source) && /onShareTimeline\(\)/.test(source)
  ))
) {
  throw new Error('首页或原生预览没有完整开启微信分享菜单')
}
if (
  !/loadingProgress/.test(previewMarkup)
  || !/readFileWithProgress/.test(previewLogic + libraryLogic)
  || !/onFirstFrame/.test(previewLogic)
) {
  throw new Error('原生大文件加载进度或首帧完成反馈缺失')
}
if (
  !/type === 'down'[\s\S]*ensureStateMachine/.test(nativeRuntime)
  || !/getCanvasTouchPoint/.test(previewLogic)
) {
  throw new Error('画布首次点击未自动接管到 Rive 状态机')
}
if (
  !/node_modules\/@rive-app\/canvas-advanced['"]?\)/.test(vendorScript)
  || /canvas-advanced-lite/.test(vendorScript)
  || !/BROTLI_PARAM_QUALITY/.test(vendorScript)
  || !/rive\.wasm\.br/.test(nativeRuntime)
) {
  throw new Error('Rive vendor 脚本未固定到完整 Canvas 运行时')
}
const hasCorrectAdvanceOrder = (source) => (
  /stateMachine\.advance\(elapsed\)[\s\S]{0,100}artboard(?:\?\.|\.)advance\(elapsed\)/.test(source)
  && !/advanceAndApply/.test(source)
)
if (
  !/activeStateMachineHasListeners\(\)/.test(nativeRuntime)
  || !/runtime\.hasListeners\(this\.stateMachine\)/.test(nativeRuntime)
  || !hasCorrectAdvanceOrder(nativeRuntime)
  || !/advanceStateMachine\(0\)/.test(nativeRuntime)
  || !/pointerExit/.test(nativeRuntime)
) {
  throw new Error('含 Listener 的状态机未获得默认交互优先级')
}
if (
  !/defaultArtboardViewModel/.test(nativeRuntime)
  || !/setViewModelInstance/.test(nativeRuntime)
  || !/target\.bind\(\)/.test(nativeRuntime)
  || !/boundViewModelInstances/.test(nativeRuntime)
) {
  throw new Error('Rive View Model 默认实例未自动绑定')
}
if (
  /canvasX\s*=\s*x\s*\*\s*this\.pixelRatio/.test(nativeRuntime)
  || !/clientX\s*-\s*canvasLeft/.test(previewLogic)
) {
  throw new Error('真机触摸未使用逻辑画布坐标')
}
if (
  !/enteredOnlyUnnamedStates/.test(nativeRuntime)
  || !/fallbackAnimation/.test(nativeRuntime)
) {
  throw new Error('空状态 Trigger 缺少同名时间轴回退')
}
if (
  !/Image:\s*root\.Image/.test(nativeRuntime)
  || !/var Image = moduleArg\.Image/.test(nativeVendor)
  || !/var URL = moduleArg\.URL/.test(nativeVendor)
) {
  throw new Error('嵌入图片运行时缺少 Image / URL 显式注入')
}

console.log('项目结构、JSON、Rive 文件头与可见文案检查通过。')
