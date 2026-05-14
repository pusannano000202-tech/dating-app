'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5 bg-[#0a0a14] text-white">
      <div className="text-center">
        <p className="text-5xl mb-4">⚠️</p>
        <h1 className="text-xl font-black mb-2">예상치 못한 오류가 발생했어</h1>
        <p className="text-gray-500 text-sm mb-8">잠시 후 다시 시도해봐.</p>
        <button
          onClick={reset}
          className="btn-gradient px-8 py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-violet-900/30"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
