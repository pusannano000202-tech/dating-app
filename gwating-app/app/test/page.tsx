"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { questions } from "@/data/questions";
import { saveUser } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { TraitKey, MemberRole, UserProfile, Gender } from "@/types/matching";

const ROLE_LABELS: Record<MemberRole, { name: string; desc: string }> = {
  moodMaker:   { name: "분위기 메이커형", desc: "에너지를 끌어올리고 자리를 살려주는 역할이에요." },
  coordinator: { name: "조율자형",        desc: "대화 흐름을 이어주고 균형을 맞추는 역할이에요." },
  considerate: { name: "배려형",          desc: "모두를 세심하게 챙기는 역할이에요." },
  reactor:     { name: "리액션형",        desc: "분위기를 살려주는 반응으로 자리를 따뜻하게 해요." },
};

const TRAIT_LABELS: Record<string, string> = {
  atmosphereCoordination: "분위기 조율",
  consideration:          "배려심",
  participation:          "적극성",
  respectfulness:         "예의/존중",
  communicationBalance:   "소통 균형",
};

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "남자" },
  { value: "female", label: "여자" },
];

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
        <PageShell className="pt-8">
          <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ START</p>
          <h2 className="mt-2 text-[26px] font-black leading-[1.3] tracking-[-1px]">
            먼저 성별을
            <br />
            알려주세요
          </h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-muted">
            팀 매칭에만 사용돼요.
            <br />
            <span className="text-xs text-muted/60">매칭 외 목적으로 사용되지 않아요</span>
          </p>
          <div className="mt-8 flex gap-3">
            {GENDER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                className={`flex-1 rounded-card border-[1.5px] py-7 text-center text-base font-extrabold transition-all active:scale-[0.97] ${
                  gender === value
                    ? "chip-pop border-[#FF4D3D] bg-[#FFF6F1] text-[#E5402E] shadow-[0_10px_22px_rgba(255,77,61,0.16)]"
                    : "border-line bg-white text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-auto pt-8">
            <Button fullWidth disabled={!gender} onClick={handleGenderNext}>
              다음 — 성향 테스트 시작
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  // ── 결과 ──
  if (step === "result" && resultRole) {
    const info = ROLE_LABELS[resultRole];

    return (
      <>
        <AppHeader step={1} totalSteps={3} />
        <PageShell className="pt-8">
          <p className="text-center text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">
            ✦ RESULT
          </p>
          <h2 className="mt-2 text-center text-[26px] font-black tracking-[-1px]">{info.name}</h2>
          <p className="mt-2 text-center text-sm font-medium leading-relaxed text-muted">
            {info.desc}
          </p>

          {finalTraits && (
            <Card className="mt-7 flex flex-col gap-3.5">
              {Object.entries(finalTraits).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-right text-[10px] font-bold text-muted">
                    {TRAIT_LABELS[key] ?? key}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1EDE6]">
                    <div
                      className="h-full rounded-full bg-electric transition-all duration-500"
                      style={{ width: `${(value / 5) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-[10px] font-black text-[#E5402E]">
                    {value * 20}
                  </span>
                </div>
              ))}
            </Card>
          )}

          <div className="mt-6">
            <label className="mb-2 block text-[10px] font-extrabold tracking-[2px] text-muted">
              닉네임을 입력해주세요
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="예: 민준"
              maxLength={10}
              className="h-12 w-full rounded-btn border-[1.5px] border-line bg-white px-4 text-base text-ink focus:border-[#FF9D7E] focus:outline-none"
            />
          </div>
          <div className="mt-auto pt-6">
            <Button fullWidth onClick={handleSave} disabled={!nickname.trim()}>
              팀 만들러 가기
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  // ── 퀴즈 ──
  return (
    <>
      <AppHeader step={1} totalSteps={3} />
      <PageShell key={currentIdx} className="pt-6">
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= currentIdx ? "bg-electric" : "bg-ink/10"
              }`}
            />
          ))}
        </div>
        <p className="mt-8 text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">
          ✦ QUESTION {String(currentIdx + 1).padStart(2, "0")}
        </p>
        <h1 className="mt-2 text-2xl font-black leading-[1.35] tracking-[-0.8px]">
          {current.situation}
        </h1>
        <div className="mt-7 flex flex-col gap-3">
          {current.choices.map((choice, i) => (
            <Card
              key={i}
              pressable
              onClick={() => handleSelect(choice.score)}
              className="px-[18px] py-4"
            >
              <p className="text-sm font-bold leading-snug">{choice.text}</p>
            </Card>
          ))}
        </div>
        <p className="mt-auto pt-6 text-center text-[10px] font-semibold text-muted">
          {currentIdx + 1} / {questions.length}
        </p>
      </PageShell>
    </>
  );
}
