import Link from "next/link";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { BoltLogo } from "@/components/ui/BoltLogo";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { PageShell } from "@/components/ui/PageShell";

export default function WelcomePage() {
  return (
    <PageShell stagger={false} className="px-7">
      <AuroraBlob className="-right-28 -top-24 h-80 w-80 bg-[#FF3D5A]/15" />
      <AuroraBlob className="-left-32 top-72 h-72 w-72 bg-[#C9B8FF]/20 [animation-delay:-4s]" />
      <AuroraBlob className="-bottom-20 -right-16 h-60 w-60 bg-[#FF7A3D]/10 [animation-delay:-7s]" />

      <div className="mt-6 flex animate-rise items-center gap-2.5 [animation-delay:0.15s]">
        <span className="animate-bolt-in [animation-delay:0.25s]">
          <BoltLogo size={24} />
        </span>
        <span className="text-[21px] font-black tracking-[-0.6px]">부팅</span>
      </div>

      <div className="my-auto">
        <h1 className="text-[38px] font-black leading-[1.22] tracking-[-1.8px]">
          <span className="block animate-rise [animation-delay:0.5s]">연애세포,</span>
          <span className="block animate-rise [animation-delay:0.68s]">
            다시{" "}
            <em className="bg-electric bg-clip-text not-italic text-transparent">
              부팅
            </em>
            할
          </span>
          <span className="block animate-rise [animation-delay:0.86s]">시간.</span>
        </h1>
        <p className="mt-4 animate-rise text-[15px] font-medium leading-[1.75] text-muted [animation-delay:1.1s]">
          부산대생 팀 과팅 · 프로필 비공개
          <br />
          매칭부터 시간·장소까지 자동 확정
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-4">
        <div className="animate-rise [animation-delay:1.35s]">
          <ButtonLink href="/test" variant="ink" fullWidth className="animate-glow-breathe">
            시작하기 <BoltLogo size={16} variant="electric" />
          </ButtonLink>
        </div>
        <Link
          href="/team/create"
          className="animate-rise text-center text-sm font-semibold text-muted [animation-delay:1.55s]"
        >
          팀 초대를 받으셨나요?{" "}
          <b className="font-extrabold text-[#E5402E]">코드로 합류 →</b>
        </Link>
      </div>
    </PageShell>
  );
}
