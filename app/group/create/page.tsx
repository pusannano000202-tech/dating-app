'use client'

// TODO: 성준 담당 — 그룹 생성/초대 화면 완성 후 이 파일 교체
export default function GroupCreatePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full bg-fuchsia-600/15 blur-[80px]" />
      </div>

      <div className="relative text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl gradient-brand mb-6 shadow-2xl shadow-violet-900/50">
          <span className="text-4xl">👥</span>
        </div>
        <h1 className="text-2xl font-black mb-2">그룹 만들기</h1>
        <p className="text-gray-500 text-sm">성준이가 개발 중이야. 곧 완성될 거야!</p>
      </div>
    </div>
  )
}
