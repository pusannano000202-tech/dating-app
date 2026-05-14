'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[ProfileError]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full bg-rose-600/10 blur-[80px]" />
      </div>

      <div className="relative text-center max-w-xs w-full">
        <p className="text-5xl mb-4">😵</p>
        <h1 className="text-xl font-black mb-2">프로필 입력 중 오류가 생겼어</h1>
        <p className="text-gray-500 text-sm mb-1">입력한 내용은 자동 저장됐을 수 있어.</p>
        <p className="text-gray-600 text-xs mb-8">네트워크 연결을 확인하고 다시 시도해봐.</p>

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="btn-gradient w-full py-4 rounded-2xl font-bold text-sm shadow-lg shadow-violet-900/30"
          >
            다시 시도
          </button>
          <button
            onClick={() => router.push('/profile/edit')}
            className="w-full py-3 rounded-2xl glass text-sm text-gray-400 hover:text-gray-200 border border-white/5 transition-colors"
          >
            프로필 편집으로 이동
          </button>
        </div>
      </div>
    </div>
  )
}
