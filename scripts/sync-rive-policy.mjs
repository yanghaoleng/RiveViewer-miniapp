import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'shared/rive-policy.json')
const targetPath = path.join(root, 'shared/rive-policy.js')
const policy = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
const generated = `// 由 scripts/sync-rive-policy.mjs 生成，请只修改 rive-policy.json。\nconst rivePolicy = ${JSON.stringify(policy, null, 2)}\n\nmodule.exports = rivePolicy\n`

if (process.argv.includes('--check')) {
  const current = await fs.readFile(targetPath, 'utf8').catch(() => '')
  if (current !== generated) {
    throw new Error('共享策略未同步，请先运行 npm run sync:policy')
  }
  console.log('共享 Rive 策略与微信运行时模块一致。')
} else {
  await fs.writeFile(targetPath, generated)
  console.log('已生成 shared/rive-policy.js。')
}
