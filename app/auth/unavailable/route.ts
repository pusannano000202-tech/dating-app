export function GET() {
  return Response.json(
    { error: '인증 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
    {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': '30',
      },
    },
  )
}
