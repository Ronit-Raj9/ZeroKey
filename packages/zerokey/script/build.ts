#!/usr/bin/env bun
import { $ } from 'bun'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const root = path.join(__dirname, '..')
const src = path.join(root, 'src')
const dist = path.join(root, 'dist')

console.log('Building @ronii/zerokey...')

// Clean dist
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true })
}
fs.mkdirSync(dist, { recursive: true })

// Build each entry point
const entries = [
  { name: 'index', input: 'index.ts' },
  { name: 'sdk', input: 'sdk.ts' },
  { name: 'ui', input: 'ui.ts' },
  { name: 'cli', input: 'cli.ts' },
]

for (const { name, input } of entries) {
  const srcPath = path.join(src, input)
  if (fs.existsSync(srcPath)) {
    console.log(`  Building ${name}...`)

    // Build JS
    await $`bun build ${srcPath} --outdir ${dist} --target bun --external @ronii/zerokey-sdk --external @ronii/zerokey-ui --external xdg-basedir`
      .quiet()

    // Rename output to match entry name
    const builtJs = path.join(dist, 'cli.js')
    if (fs.existsSync(builtJs) && name !== 'cli') {
      fs.renameSync(builtJs, path.join(dist, `${name}.js`))
    }

    // Generate types
    try {
      await $`bun --bun tsc ${srcPath} --declaration --emitDeclarationOnly --outDir ${dist} --skipLibCheck --module esnext --target esnext --moduleResolution bundler --allowImportingTsExtensions --resolveJsonModule`
        .quiet()

      const builtDts = path.join(dist, 'cli.d.ts')
      if (fs.existsSync(builtDts) && name !== 'cli') {
        fs.renameSync(builtDts, path.join(dist, `${name}.d.ts`))
      }
    } catch (e) {
      console.log(`  Warning: Could not generate types for ${name}`)
    }
  }
}

// Make CLI executable
const cliPath = path.join(dist, 'cli.js')
if (fs.existsSync(cliPath)) {
  const content = fs.readFileSync(cliPath, 'utf8')
  if (!content.startsWith('#!/usr/bin/env node')) {
    fs.writeFileSync(cliPath, '#!/usr/bin/env node\n' + content)
  }
  fs.chmodSync(cliPath, 0o755)
}

console.log('Build complete!')
