import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const TARGETS = [
  { label: 'original-tonight-local', container: 'supabase_db_quantum-tonight-live-local', port: '56322' },
  { label: 'integrated-local', container: 'supabase_db_quantum-integrated-campus-20260905', port: '56422' },
]
const TABLES = [
  'auth.users', 'public.profiles', 'public.friendships', 'public.friend_requests', 'public.friend_direct_messages',
  'public.groups', 'public.group_members', 'public.activity_meetups', 'public.activity_meetup_members',
  'public.quantum_meeting_series', 'public.quantum_meeting_occurrences', 'public.quantum_occurrence_mission_photos',
  'public.quantum_continuation_sources', 'public.quantum_continuation_series', 'public.quantum_continuation_occurrences',
  'public.quantum_weekly_applications', 'public.quantum_weekly_application_members',
  'public.quantum_continuation_album_photos',
]

export function compareInventories(inventories) {
  return {
    operation: 'read_only_aggregate_inventory',
    inventories,
    dataCopied: false,
    allHistoricalDataVerified: false,
    warning: 'Counts from separate local databases are not lost-row counts. No identity or legacy-to-continuation mapping is inferred. G4 and remote databases are not inspected.',
  }
}

export function readLocalInventory(target, run = execFileSync) {
  if (!TARGETS.some(allowed => JSON.stringify(allowed) === JSON.stringify(target))) throw new Error('unknown_local_database')
  const ports = JSON.parse(run('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', target.container], { encoding: 'utf8' }))
  if (!ports['5432/tcp']?.some(binding => binding.HostPort === target.port)) throw new Error('local_database_port_mismatch')
  const query = sql => run('docker', ['exec', target.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `begin read only; ${sql}; rollback;`], { encoding: 'utf8' })
  const records = TABLES.map(name => {
    const exists = query(`select to_regclass('${name}') is not null`).split(/\r?\n/).includes('t')
    if (!exists) return { table: name, exists: false, rows: null }
    const line = query(`select count(*) from ${name}`).split(/\r?\n/).find(value => /^\d+$/.test(value))
    if (line === undefined) throw new Error('invalid_count_response')
    return { table: name, exists: true, rows: Number(line) }
  })
  return { label: target.label, port: target.port, tables: records }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw new Error('No arguments accepted; fixed local targets only.')
  console.log(JSON.stringify(compareInventories(TARGETS.map(target => readLocalInventory(target))), null, 2))
}
