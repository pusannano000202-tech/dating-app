import Link from "next/link";
import { Button } from "@/components/Button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-between px-7 pt-14 pb-10">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-lg shadow-[0_3px_10px_rgba(255,90,111,0.25)]">
            ⚡
          </div>
          <span className="text-[22px] font-black text-ink tracking-[-0.8px]">부팅</span>
        </div>
        <p className="text-[10px] font-semibold text-muted tracking-[1.5px] uppercase">
          부산대 과팅 서비스
        </p>
      </div>

      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-primary-soft border-2 border-primary-disabled flex items-center justify-center text-[56px] shadow-[0_8px_32px_rgba(255,90,111,0.10)]">
          🎉
        </div>
        <span className="absolute -top-1 -right-1 text-xl">✨</span>
        <span className="absolute -bottom-1 -left-3 text-lg">💬</span>
      </div>

      <div className="w-full text-center">
        <h1 className="text-[21px] font-black text-ink leading-snug tracking-[-0.6px] mb-1.5">
          당신의 연애세포를
          <br />
          <span className="text-primary">부팅</span>하세요!
        </h1>
        <p className="text-xs text-muted mb-6 leading-relaxed">
          부산대생끼리 팀을 이뤄
          <br />
          딱 맞는 상대팀과 설레는 과팅을
        </p>
        <Link href="/test" className="block mb-3">
          <Button variant="primary" fullWidth>
            성향 테스트 시작하기 →
          </Button>
        </Link>
        <Link href="/team/create" className="text-xs text-muted">
          팀 초대를 받으셨나요?{" "}
          <span className="text-primary font-bold">코드로 합류</span>
        </Link>
      </div>
    </main>
  );
}
