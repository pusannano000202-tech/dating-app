import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function collectSourceFiles(directory: string): string[] {
  const absoluteDirectory = join(ROOT, directory)

  return readdirSync(absoluteDirectory).flatMap((entry) => {
    const relativePath = join(directory, entry)
    const absolutePath = join(ROOT, relativePath)

    if (statSync(absolutePath).isDirectory()) {
      return collectSourceFiles(relativePath)
    }

    return /\.(?:ts|tsx)$/.test(entry) ? [relativePath] : []
  })
}

test('all Supabase server clients await the async cookies contract', () => {
  const sourceFiles = collectSourceFiles('app')
  const offenders = sourceFiles.filter((path) => {
    const source = readFileSync(join(ROOT, path), 'utf8')

    return source.includes('createSupabaseServerClient()')
      && !source.includes('await createSupabaseServerClient()')
  })

  assert.deepEqual(offenders, [])
})

test('dynamic route params use the Next 15 async request contract', () => {
  const routeFiles = collectSourceFiles('app')
    .filter((path) => path.endsWith('route.ts') && path.includes('['))
  const offenders = routeFiles.filter((path) => {
    const source = readFileSync(join(ROOT, path), 'utf8')
    const receivesParams = /\{\s*params\s*\}/.test(source)

    if (!receivesParams) {
      return false
    }

    return !/params:\s*Promise</.test(source) || !/await\s+params/.test(source)
  })

  assert.deepEqual(offenders, [])
})
