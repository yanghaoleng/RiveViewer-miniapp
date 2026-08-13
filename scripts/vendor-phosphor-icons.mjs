import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(root, 'node_modules/@phosphor-icons/core/assets/bold')
const targetRoot = path.join(root, 'assets/icons')

const icons = [
  ['arrow-left.svg', 'arrow-left', '#d8dde5'],
  ['arrow-right.svg', 'arrow-right', '#d8dde5'],
  ['arrows-in-simple.svg', 'arrows-in-simple', '#aeb7c3'],
  ['arrows-in-simple-active.svg', 'arrows-in-simple', '#f2c94c'],
  ['arrows-out-simple.svg', 'arrows-out-simple', '#aeb7c3'],
  ['arrows-out-simple-active.svg', 'arrows-out-simple', '#f2c94c'],
  ['chevron-down.svg', 'caret-down', '#96a2b2'],
  ['copy-simple.svg', 'copy-simple', '#f2c94c'],
  ['download.svg', 'download-simple', '#f2c94c'],
  ['gauge.svg', 'gauge', '#f2c94c'],
  ['player-pause.svg', 'pause', '#d8dde5'],
  ['player-play.svg', 'play', '#d8dde5'],
  ['plus.svg', 'plus', '#17130a'],
  ['restore.svg', 'arrow-counter-clockwise', '#17130a'],
  ['caret-left.svg', 'caret-left', '#f2f0e8'],
  ['house.svg', 'house', '#f2f0e8'],
  ['circle-notch.svg', 'circle-notch', '#aeb7c3'],
]

await fs.mkdir(targetRoot, { recursive: true })

for (const [targetName, sourceName, color] of icons) {
  const sourcePath = path.join(sourceRoot, `${sourceName}-bold.svg`)
  const targetPath = path.join(targetRoot, targetName)
  const source = await fs.readFile(sourcePath, 'utf8')
  const output = source
    .replace('fill="currentColor"', `fill="${color}" data-icon-family="phosphor" data-icon-name="${sourceName}" data-icon-weight="bold"`)
    .trim()
  await fs.writeFile(targetPath, `${output}\n`)
}

console.log(`Vendored ${icons.length} Phosphor Bold icons.`)
