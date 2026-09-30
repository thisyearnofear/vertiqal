import { readFileSync, statSync } from 'node:fs'
import { compareValidationCapture } from './validation.ts'

const args = process.argv.slice(2)
if (args.length !== 4 || args[2] !== '--tolerance-ms') {
  console.error('Usage: pnpm validate:motion <capture.json> <annotations.json> --tolerance-ms <positive number>')
  process.exitCode = 2
} else {
  try {
    const readJson = (path: string): unknown => {
      if (statSync(path).size > 64 * 1024 * 1024) throw new Error('Validation input exceeds the 64 MiB file limit')
      return JSON.parse(readFileSync(path, 'utf8'))
    }
    const report = compareValidationCapture(readJson(args[0]), readJson(args[1]), Number(args[3]))
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Motion comparison failed')
    process.exitCode = 1
  }
}
