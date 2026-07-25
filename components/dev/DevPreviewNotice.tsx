import { FlaskConical } from 'lucide-react'

export default function DevPreviewNotice() {
  return (
    <aside className="mb-4 flex items-start gap-3 rounded-lg border border-[#D99A32]/40 bg-[#FFF8E7] px-4 py-3 text-[#6F4A0A]" aria-label="개발 미리보기 안내">
      <FlaskConical className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div>
        <p className="text-sm font-black">개발 미리보기</p>
        <p className="mt-0.5 text-xs font-bold leading-5">표시된 데이터와 조작은 실제 계정에 저장되지 않아요.</p>
      </div>
    </aside>
  )
}
