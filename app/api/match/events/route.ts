import { NextResponse } from 'next/server'

import { getQuantumEventApiCatalog } from '@/lib/matching/quantum-event-catalog'

export async function GET() {
  return NextResponse.json({
    events: getQuantumEventApiCatalog(),
    availability: 'ready',
  })
}
