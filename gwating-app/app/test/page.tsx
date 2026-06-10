"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { QuizCard } from "@/components/QuizCard";
import { Button } from "@/components/Button";
import { questions } from "@/data/questions";
import { saveUser } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { TraitKey, MemberRole, UserProfile, Gender } from "@/types/matching";

const ROLE_LABELS: Record<MemberRole, { name: string; desc: string; emoji: string }> = {
  moodMaker:   { name: "분위기 메이커형", desc: "에너지를 끌어올리고 자리를 살려주는 역할이에요.",  emoji: "🔥" },
  coordinator: { name: "조율자형",        desc: "대화 흐름을 이어주고 균형을 맞추는 역할이에요.",    emoji: "🎯" },
  considerate: { name: "배려형",          desc: "모두를 세심하게 챙기는 역할이에요.",               emoji: "🤍" },
  reactor:     { name: "리액션형",        desc: "분위기를 살려주는 반응으로 자리를 따뜻하게 해요.", emoji: "✨" },
};

const TRAIT_LABELS: Record<string, string> = {
  atmosphereCoordination: "분위기 조율",
  consideration:          "배려심",
  participation:          "적극성",
  respectfulness:         "예의/존중",
  communicationBalance:   "소통 균형",
};

type TraitScores = Partial<Record<TraitKey, number[]>>;
type Step = "gender" | "quiz" | "result";

export default function TestPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("gender");
  const [gender, setGender] = useState<Gender | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [traitScores, setTraitScores] = useState<TraitScores>({});
  const [nickname, setNickname] = useState("");
  const [resultRole, setResultRole] = useState<MemberRole | null>(null);
  const [finalTraits, setFinalTraits] = useState<Record<TraitKey, number> | null>(null);

  const current = questions[currentIdx];

  function handleGenderNext() {
    if (!gender) return;
    setStep("quiz");
  }

  function handleSelect(score: number) {
    const trait = current.trait;
    const updated: TraitScores = {
      ...traitScores,
      [trait]: [...(traitScores[trait] ?? []), score],
    };
    setTraitScores(updated);

    if (currentIdx + 1 >= questions.length) {
      const allTraits: TraitKey[] = [
        "atmosphereCoordination", "consideration", "participation",
        "respectfulness", "communicationBalance",
      ];
      const traits = allTraits.reduce((acc, key) => {
        const scores = updated[key] ?? [3];
        acc[key] = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
        return acc;
      }, {} as Record<TraitKey, number>);

      setFinalTraits(traits);
      setResultRole(classifyRole(traits));
      setStep("result");
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  function handleSave() {
    if (!nickname.trim() || !finalTraits || !gender) return;
    const profile: UserProfile = { nickname: nickname.trim(), traits: finalTraits, gender };
    saveUser(profile);
    router.push("/team/create");
  }

  // ── 성별 선택 ──
  if (step === "gender") {
    return (
      <>
        <AppHeader step={1} totalSteps={3} />
        <main className="py-12 px-4 bg-white min-h-screen">
          <div className="max-w-[400px] mx-auto text-center">
            <div className="text-4xl mb-4">👋</div>
            <h2 className="text-xl font-black text-ink tracking-[-0.5px] mb-2">먼저 성별을 알려주세요</h2>
            <p className="text-sm text-muted mb-8 leading-relaxed">
              팀 매칭에 사용돼요.<br />
              <span className="text-[11px] text-muted/60">매칭 외 목적으로 사용되지 않아요</span>
            </p>
            <div className="flex gap-4 mb-8">
              <button
                type="button"
                onClick={() => setGender("male")}
                className={`flex-1 border-[2px] rounded-[16px] py-5 flex flex-col items-center gap-2 transition-all ${
                  gender === "male"
                    ? "border-[#4f9eff] bg-[#f0f5ff]"
                    : "border-hairline bg-white hover:border-hairline-soft"
                }`}
              >
                <span className="text-3xl">🙋‍♂️</span>
                <span className="text-sm font-bold text-ink">남자</span>
              </button>
              <button
                type="button"
                onClick={() => setGender("female")}
                className={`flex-1 border-[2px] rounded-[16px] py-5 flex flex-col items-center gap-2 transition-all ${
                  gender === "female"
                    ? "border-primary bg-primary-soft"
                    : "border-hairline bg-white hover:border-hairline-soft"
                }`}
              >
                <span className="text-3xl">🙋‍♀️</span>
                <span className="text-sm font-bold text-ink">여자</span>
              </button>
            </div>
            <Button fullWidth disabled={!gender} onClick={handleGenderNext}>
              다음 — 성향 테스트 시작 →
            </Button>
          </div>
        </main>
      </>
    );
  }

  // ── 결과 ──
  if (step === "result" && resultRole) {
    const info = ROLE_LABELS[resultRole];

    return (
      <>
        <AppHeader step={1} totalSteps={3} />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto">
            {/* 역할 결과 */}
            <div className="text-center mb-8">
              <div className="text-[52px] mb-3 drop-shadow-sm">{info.emoji}</div>
              <h2 className="text-2xl font-black text-ink tracking-[-0.5px] mb-2">{info.name}</h2>
              <p className="text-sm text-muted leading-relaxed">{info.desc}</p>
            </div>

            {/* 성향 점수 바 */}
            {finalTraits && (
              <div className="bg-surface-soft rounded-card p-4 mb-6 flex flex-col gap-3">
                {Object.entries(finalTraits).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-muted w-16 shrink-0 text-right">
                      {TRAIT_LABELS[key] ?? key}
                    </span>
                    <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-[#ff8a65] rounded-full transition-all duration-500"
                        style={{ width: `${(value / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-black text-primary w-6 text-right">
                      {value * 20}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 닉네임 입력 */}
            <div className="mb-4">
              <label className="block text-sm font-bold text-ink mb-2">
                닉네임을 입력해주세요
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="예: 민준"
                maxLength={10}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>
            <Button fullWidth onClick={handleSave} disabled={!nickname.trim()}>
              팀 만들러 가기 →
            </Button>
          </div>
        </main>
      </>
    );
  }

  // ── 퀴즈 ──
  return (
    <>
      <AppHeader step={1} totalSteps={3} />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-ink tracking-[-0.5px]">나의 과팅 스타일은?</h1>
          <p className="text-sm text-muted mt-1">상황을 읽고 솔직하게 골라주세요</p>
        </div>
        <QuizCard
          question={current}
          current={currentIdx + 1}
          total={questions.length}
          onSelect={handleSelect}
        />
      </main>
    </>
  );
}
