import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = JSON.parse(await fs.readFile(path.join(root, 'project.config.json'), 'utf8'))
const ignoreRules = project.packOptions?.ignore || []
const PACKAGE_BUDGET_BYTES = 1_700_000

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function isIgnored(relativePath, directory = false) {
  const target = normalize(relativePath)
  if (!target) return false
  return ignoreRules.some((rule) => {
    const value = normalize(rule.value || '').replace(/\/$/, '')
    if (rule.type === 'file') return target === value
    if (rule.type === 'folder') return target === value || target.startsWith(`${value}/`)
    return false
  }) || (directory && target === '.git') || target.startsWith('.git/')
}

async function collect(relativeDirectory = '') {
  const entries = await fs.readdir(path.join(root, relativeDirectory), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = normalize(path.join(relativeDirectory, entry.name))
    if (isIgnored(relativePath, entry.isDirectory())) continue
    if (entry.isDirectory()) files.push(...await collect(relativePath))
    else if (entry.isFile()) files.push(relativePath)
  }
  return files
}

const files = await collect()
const sizes = await Promise.all(files.map(async (relativePath) => ({
  relativePath,
  bytes: (await fs.stat(path.join(root, relativePath))).size
})))
const totalBytes = sizes.reduce((sum, item) => sum + item.bytes, 0)

if (totalBytes > PACKAGE_BUDGET_BYTES) {
  const largest = sizes
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 8)
    .map((item) => `${item.relativePath} ${(item.bytes / 1024).toFixed(1)} KB`)
    .join('\n')
  throw new Error(
    `小程序上传源包 ${(totalBytes / 1024).toFixed(1)} KB 超过预算 ${(PACKAGE_BUDGET_BYTES / 1024).toFixed(1)} KB\n${largest}`
  )
}

console.log(
  `小程序上传源包预算通过：${files.length} 个文件，${totalBytes} B（${(totalBytes / 1024).toFixed(1)} KB）。`
)
