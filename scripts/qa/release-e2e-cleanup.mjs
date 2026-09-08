import { createRuntime, cleanupUsersByRunId, readManifest } from './release-e2e-runtime.mjs'
import { progress, validateRunId } from './release-e2e-safety.mjs'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

try {
  const manifestPath = argument('--manifest')
  const manifest = manifestPath ? await readManifest(manifestPath) : null
  const runId = validateRunId(argument('--run-id') || manifest?.run_id)
  const runtime = await createRuntime(manifest?.suite || 'matching-five', runId)
  await cleanupUsersByRunId(runtime.admin, runId)
  progress({ suite: manifest?.suite || 'matching-five', runId, check: 'run_id_cleanup', status: 'cleanup' })
} catch {
  process.exitCode = 1
}
