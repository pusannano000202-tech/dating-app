import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full bg-fuchsia-600/15 blur-[80px]" />
      </div>

      <div className="relative text-center">
        <p className="text-8xl font-black gradient-brand-text mb-4">404</p>
        <h1 className="text-2xl font-black mb-2">페이지를 못 찾겠어</h1>
        <p className="text-gray-500 text-sm mb-8">잘못된 주소거나 삭제된 페이지야.</p>
        <Link
          href="/"
          className="btn-gradient inline-block px-8 py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-violet-900/30"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
