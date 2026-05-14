import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-black mb-2">부산대 과팅앱</h1>
      <p className="text-gray-400 mb-12">그룹미팅 자동확정 매칭 플랫폼</p>
      <Link
        href="/profile/worldcup"
        className="px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded-2xl font-bold text-lg transition-colors"
      >
        이상형 월드컵 시작
      </Link>
    </main>
  )
}
