const baseUrl = process.env.QA_BASE_URL
const cronSecret = process.env.CRON_SECRET

if (!baseUrl || !cronSecret) {
  console.error('QA_BASE_URL and CRON_SECRET are required. This script never enables destructive processing.')
  process.exitCode = 2
} else {
  const response = await fetch(new URL('/api/internal/retention/process', baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dryRun: true, limit: 25 }),
  })
  const payload = await response.json().catch(() => null)
  console.log(JSON.stringify({ status: response.status, payload }, null, 2))
  if (!response.ok || payload?.dryRun !== true) process.exitCode = 1
}
