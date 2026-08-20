import { NextResponse } from 'next/server'
import {
  getCampusEatsCategoryResponse,
  resolveCampusEatsCategoryId,
} from '../../../lib/campus-eats/repository'

export async function GET(request: Request) {
  const requestedCategory = new URL(request.url).searchParams.get('category')
  const category = resolveCampusEatsCategoryId(requestedCategory)
  if (!category) {
    return NextResponse.json({
      error: {
        code: 'invalid_category',
        message: 'category must be a supported Campus Eats category',
      },
    }, { status: 400 })
  }

  const data = getCampusEatsCategoryResponse(category)
  if (!data) {
    return NextResponse.json({ error: { code: 'category_not_found' } }, { status: 404 })
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
