export default function ProfileLoading() {
  return (
    <div className="px-5 pt-4 pb-10 flex flex-col gap-5 animate-pulse">
      {/* 헤더 스켈레톤 */}
      <div className="mt-3">
        <div className="h-7 w-40 bg-white/10 rounded-xl mb-2" />
        <div className="h-4 w-56 bg-white/5 rounded-lg" />
      </div>
      {/* 카드 스켈레톤 3개 */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 bg-white/5 rounded-2xl" />
      ))}
      {/* 버튼 스켈레톤 */}
      <div className="mt-auto h-14 bg-white/10 rounded-2xl" />
    </div>
  )
}
