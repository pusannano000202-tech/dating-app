import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Radio, ShieldCheck } from 'lucide-react'

export default function CampusSevenMatchEntry({ href = '/match/campus-seven' }: { href?: string }) {
  const visible = process.env.NODE_ENV !== 'production'
    || process.env.NEXT_PUBLIC_CAMPUS_SEVEN_ENABLED === 'true'

  if (!visible) return null

  return (
    <Link
      href={href}
      className="group mb-5 block overflow-hidden rounded-[30px] border border-boot-primary/20 bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-boot-soft">
        <Image
          src="/campus-seven/campus-seven-hero.png"
          alt="캠퍼스에서 새로운 인연을 만나는 대학생들"
          fill
          sizes="(max-width: 640px) calc(100vw - 40px), 448px"
          className="object-cover transition duration-500 group-hover:scale-[1.02]"
        />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-boot-coral px-3 py-1.5 text-[11px] font-black text-white shadow-sm">
          <Radio size={13} /> QUANTUM ORIGINAL
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-boot-primary">부산대 첫 파일럿</p>
            <h2 className="mt-1 text-xl font-black text-boot-ink">7일 캠퍼스</h2>
            <p className="mt-2 text-xs font-bold leading-5 text-boot-muted">실제 만남이 진행되는 동안 다음 장면과 필요한 행동을 앱이 실시간으로 알려드려요.</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-boot-primary text-white transition group-hover:translate-x-0.5">
            <ArrowRight size={18} />
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-boot-hairline pt-3 text-[11px] font-black text-boot-body">
          <ShieldCheck size={15} className="text-boot-primary" /> 학교 인증 성인 · 공개 장소 · 비공개 선택
        </div>
      </div>
    </Link>
  )
}
