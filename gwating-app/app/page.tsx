import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { MoodChip } from "@/components/MoodChip";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main>
        {/* Hero */}
        <section className="bg-canvas-warm py-16 px-4">
          <div className="max-w-[560px] mx-auto text-center">
            <p className="text-xs font-semibold text-primary mb-3 tracking-wide uppercase">
              부산대생 전용 베타
            </p>
            <h1 className="text-[32px] font-bold text-ink leading-tight mb-4">
              우리 팀 분위기에 딱 맞는<br />과팅 상대를 찾아보세요
            </h1>
            <p className="text-base text-body mb-8">
              성향 테스트로 역할을 파악하고, 팀을 만들어 궁합 점수를 확인하세요.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/test">
                <Button variant="primary" className="rounded-full">
                  성향 테스트 시작
                </Button>
              </Link>
              <Link href="/team/create">
                <Button variant="secondary" className="rounded-full">
                  팀 바로 만들기
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-14 px-4">
          <div className="max-w-[700px] mx-auto">
            <h2 className="text-2xl font-bold text-ink mb-10 text-center">어떻게 진행되나요?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { step: "01", title: "성향 테스트", desc: "10개 상황 문항으로 나의 과팅 스타일을 파악해요." },
                { step: "02", title: "팀 생성",     desc: "팀명과 분위기를 선택하고 팀원의 역할을 입력해요." },
                { step: "03", title: "매칭 추천",   desc: "궁합 점수와 이유를 바탕으로 상대팀을 추천해드려요." },
              ].map(({ step, title, desc }) => (
                <div key={step} className="bg-surface-soft rounded-lg p-6">
                  <p className="text-xs font-semibold text-primary mb-2">{step}</p>
                  <h3 className="text-base font-semibold text-ink mb-2">{title}</h3>
                  <p className="text-sm text-body">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mood examples */}
        <section className="py-10 px-4 border-t border-hairline-soft">
          <div className="max-w-[560px] mx-auto">
            <p className="text-sm font-semibold text-muted text-center mb-4">어떤 분위기를 원하세요?</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <MoodChip mood="comfortableTalk" />
              <MoodChip mood="activeSocial" />
              <MoodChip mood="gamesAndDrinks" />
              <MoodChip mood="respectfulSafe" />
              <MoodChip mood="naturalIntro" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
