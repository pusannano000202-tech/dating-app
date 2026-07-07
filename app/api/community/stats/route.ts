import { NextRequest, NextResponse } from 'next/server'
import {
  findScopes,
  getCompareScopes,
  getPublicStatsSummary,
  isScopePublic,
  MIN_PUBLIC_SAMPLE_SIZE,
} from '@/lib/community/mock-data'

function serializeScope(scope: ReturnType<typeof findScopes>[number]) {
  const publicResult = isScopePublic(scope)
  return {
    id: scope.id,
    type: scope.type,
    label: scope.label,
    parentLabel: scope.parentLabel,
    topic: scope.topic,
    sampleSize: scope.sampleSize,
    dominantLabel: publicResult ? scope.dominantLabel : '표본 부족',
    percentage: publicResult ? scope.percentage : null,
    summary: publicResult ? scope.summary : '아직 표본이 부족해요',
    isPublic: publicResult,
  }
}

export function GET(request: NextRequest) {
  const url = new URL(request.url)
  const query = url.searchParams.get('q') ?? ''
  const scopeIds = (url.searchParams.get('scope_ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  const results = findScopes(query).map(serializeScope)
  const compare = getCompareScopes(scopeIds).map(serializeScope)

  return NextResponse.json({
    query,
    compareLimit: 3,
    minimumPublicSampleSize: MIN_PUBLIC_SAMPLE_SIZE,
    summary: getPublicStatsSummary(),
    compare,
    results,
  })
}
