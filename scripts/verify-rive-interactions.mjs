import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modulePath = path.join(
  projectRoot,
  'node_modules/@rive-app/canvas-advanced/canvas_advanced.mjs'
)
const wasmPath = path.join(projectRoot, 'node_modules/@rive-app/canvas-advanced/rive.wasm')

globalThis.document = {
  createElement() {
    return { getContext: () => null }
  }
}
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Node' },
  configurable: true
})

const factory = (await import(pathToFileURL(modulePath).href)).default
const runtime = await factory({ wasmBinary: await fs.readFile(wasmPath) })
const metadataOnlyAssetLoader = new runtime.CustomFileAssetLoader({
  loadContents() {
    return true
  }
})

async function loadRive(relativePath) {
  return runtime.load(
    new Uint8Array(await fs.readFile(path.join(projectRoot, relativePath))),
    metadataOnlyAssetLoader,
    false
  )
}

function advanceStateMachine(machine, artboard, elapsed = 0) {
  machine.advance(elapsed)
  artboard.advance(elapsed)
}

async function verifyGuideIdleFallback() {
  const file = await loadRive('assets/samples/guide.riv')
  const artboard = file.artboardByName('叫叫')
  const machine = new runtime.StateMachineInstance(
    artboard.stateMachineByName('jojo-machine'),
    artboard
  )
  advanceStateMachine(machine, artboard)
  machine.input(1).asTrigger().fire()
  advanceStateMachine(machine, artboard)
  const changedStates = Array.from(
    { length: machine.stateChangedCount() },
    (_, index) => machine.stateChangedNameByIndex(index)
  )
  const hasIdleTimeline = Array.from(
    { length: artboard.animationCount() },
    (_, index) => artboard.animationByIndex(index).name
  ).some((name) => name.toLowerCase() === 'idle')

  assert.ok(changedStates.length > 0)
  assert.ok(changedStates.every((name) => !String(name || '').trim()))
  assert.equal(hasIdleTimeline, true)

  machine.delete()
  artboard.delete()
  file.unref()
}

async function verifyPianoAutoBinding() {
  const file = await loadRive('rive测试文件/Rive/27375-51723-a-piano-game.riv')
  const artboard = file.artboardByName('StageAPT')
  const machine = new runtime.StateMachineInstance(
    artboard.stateMachineByName('Piano Game'),
    artboard
  )
  const viewModel = file.defaultArtboardViewModel(artboard)
  const viewModelInstance = viewModel.defaultInstance()
  machine.setViewModelInstance(viewModelInstance)
  machine.bind()

  const keyD = () => (
    viewModelInstance.viewModel('pianoKeys').boolean('keyD').value
  )
  advanceStateMachine(machine, artboard, 1 / 60)
  assert.equal(keyD(), false)

  machine.pointerDown(300, 500, 7)
  advanceStateMachine(machine, artboard)
  assert.equal(keyD(), true)

  machine.pointerUp(300, 500, 7)
  machine.pointerExit(300, 500, 7)
  advanceStateMachine(machine, artboard)
  assert.equal(keyD(), false)

  machine.delete()
  viewModelInstance.unref()
  artboard.delete()
  file.unref()
}

await verifyGuideIdleFallback()
try {
  await fs.access(path.join(projectRoot, 'rive测试文件/Rive/27375-51723-a-piano-game.riv'))
  await verifyPianoAutoBinding()
  console.log('Guide idle 回退条件与 Piano View Model 点击链验证通过。')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  console.log('Guide idle 回退条件验证通过；本机未提供 Piano 测试文件，已跳过该项。')
}
