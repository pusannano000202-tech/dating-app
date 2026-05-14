'use client'

import { useRouter } from 'next/navigation'

// TODO: Codex(성준) 담당 — PhotoUpload + AI 서버 연동 후 이 파일 교체
export default function PhotosPage() {
  const router = useRouter()

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black">사진 등록</h1>
        <p className="text-sm text-gray-500 mt-1">매칭 후 공개될 사진을 올려줘</p>
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
        <span className="text-4xl">🚧</span>
        <p className="font-bold">개발 중</p>
        <p className="text-sm text-gray-500">사진 업로드 화면은 성준이가 만들고 있어!</p>
      </div>

      <div className="mt-auto pt-8">
        <button
          onClick={() => router.push('/profile/schedule')}
          className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30"
        >
          다음 (임시)
        </button>
      </div>
    </div>
  )
}
