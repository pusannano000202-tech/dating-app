export type ContentRecordInput = {
  sourceKey: string
  kind: 'visit' | 'places'
  category: string
  title: string
  winnerId: string
  candidates: { id: string; name: string }[]
  selections: { winnerId: string; loserId: string }[]
  completedAt: string | null
}
export type ContentRecord = ContentRecordInput & { id: string; savedAt: string; note: string; revision: number }
export class ContentInputError extends Error { constructor() { super('기록 내용을 확인해 주세요.') } }
const fail = (): never => { throw new ContentInputError() }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const row = value as Record<string, unknown>
  if (Object.keys(row).some(key => !keys.includes(key))) return fail()
  return row
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) return fail()
  return value.trim()
}
export function parseContentRecord(value: unknown): ContentRecordInput {
  const row = object(value, ['sourceKey','kind','category','title','winnerId','candidates','selections','completedAt'])
  if (row.kind !== 'visit' && row.kind !== 'places') return fail()
  const sourceKey = text(row.sourceKey, 180)
  const category = text(row.category, 50)
  if (!/^[a-z][a-z0-9:_-]+$/i.test(sourceKey) || !/^[a-z][a-z0-9_-]*$/.test(category)) return fail()
  if (!sourceKey.startsWith(`${row.kind}:`)) return fail()
  if (!Array.isArray(row.candidates) || row.candidates.length < 2 || row.candidates.length > 64) return fail()
  const candidates = row.candidates.map(value => {
    const candidate = object(value, ['id','name'])
    return { id: text(candidate.id, 120), name: text(candidate.name, 100) }
  })
  const ids = new Set(candidates.map(candidate => candidate.id))
  const winnerId = text(row.winnerId, 120)
  if (ids.size !== candidates.length || !ids.has(winnerId)) return fail()
  if (!Array.isArray(row.selections) || row.selections.length < 1 || row.selections.length > 512) return fail()
  const selections = row.selections.map(value => {
    const selection = object(value, ['winnerId','loserId'])
    const winnerId = text(selection.winnerId, 120), loserId = text(selection.loserId, 120)
    if (winnerId === loserId || !ids.has(winnerId) || !ids.has(loserId)) return fail()
    return { winnerId, loserId }
  })
  const completedAt = row.completedAt
  if (completedAt !== null && (typeof completedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(completedAt) || !Number.isFinite(Date.parse(completedAt)))) return fail()
  return { sourceKey, kind:row.kind, category, title:text(row.title,100), winnerId, candidates, selections, completedAt }
}
export function parseContentNote(value: unknown): string {
  const row = object(value, ['note'])
  if (typeof row.note !== 'string' || row.note.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(row.note)) return fail()
  return row.note.trim()
}
export function contentRestartHref(record: Pick<ContentRecordInput,'kind'|'category'>): string {
  const category = encodeURIComponent(record.category)
  return record.kind === 'places' ? `/community/places?category=${category}` : `/community/campus-eats?category=${category}&mode=setup`
}
export function parseSavedContentRecord(value: unknown): ContentRecord {
  const row=object(value,['sourceKey','kind','category','title','winnerId','candidates','selections','completedAt','id','savedAt','note','revision'])
  const {id,savedAt,note,revision,...snapshot}=row
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||typeof savedAt!=='string'||!Number.isFinite(Date.parse(savedAt))||typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<1)return fail()
  return {...parseContentRecord(snapshot),id,savedAt,note:parseContentNote({note}),revision}
}
export function contentMapHref(name: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(`부산대 ${name}`)}`
}

/** Private user-entered history, never accepted as verified public vote evidence. */
export function visitResultSnapshot(input: {
  school: string; category: string; label: string; tournamentId: string
  candidates: ReadonlyArray<{id:string;name:string}>
  session: {status:string;winnerId?:string;candidateIds:readonly string[];eventOutcomes:Readonly<Record<string,{winnerId?:string;loserId?:string}>>}
}): ContentRecordInput | null {
  if (input.session.status !== 'completed' || input.tournamentId === 'not-started') return null
  const ids = new Set(input.session.candidateIds)
  try {
    return parseContentRecord({
      sourceKey:`visit:${input.school}:${input.category}:${input.tournamentId}`, kind:'visit', category:input.category,
      title:`내 ${input.label} 1위`, winnerId:input.session.winnerId,
      candidates:input.candidates.filter(item=>ids.has(item.id)).map(({id,name})=>({id,name})),
      selections:Object.values(input.session.eventOutcomes).filter(item=>item.winnerId && item.loserId).map(item=>({winnerId:item.winnerId,loserId:item.loserId})),
      // Previous device records have no reliable completion timestamp.
      completedAt:null,
    })
  } catch { return null }
}
