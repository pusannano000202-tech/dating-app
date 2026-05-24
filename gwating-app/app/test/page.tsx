"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { QuizCard } from "@/components/QuizCard";
import { Button } from "@/components/Button";
import { questions } from "@/data/questions";
import { saveUser } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { TraitKey, MemberRole, UserProfile } from "@/types/matching";

const ROLE_LABELS: Record<MemberRole, { name: string; desc: string; emoji: string }> = {
  moodMaker:   { name: "분위기 메이커형", desc: "에너지를 끌어올리고 자리를 살려주는 역할이에요.",  emoji: "🔥" },
  coordinator: { name: "조율자형",        desc: "대화 흐름을 이어주고 균형을 맞추는 역할이에요.",    emoji: "🎯" },
  considerate: { name: "배려형",          desc: "모두를 세심하게 챙기는 역할이에요.",               emoji: "🤍" },
  reactor:     { name: "리액션형",        desc: "분위기를 살려주는 반응으로 자리를 따뜻하게 해요.", emoji: "✨" },
};

type TraitScores = Partial<Record<TraitKey, number[]>>;

export default function TestPage() {
  const router = useRouter();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [traitScores, setTraitScores] = useState<TraitScores>({});
  const [nickname, setNickname] = useState("");
  const [showNickname, setShowNickname] = useState(false);
  const [resultRole, setResultRole] = useState<MemberRole | null>(null);
  const [finalTraits, setFinalTraits] = useState<Record<TraitKey, number> | null>(null);

  const current = questions[currentIdx];

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
      setShowNickname(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  function handleSave() {
    if (!nickname.trim() || !finalTraits) return;
    const profile: UserProfile = { nickname: nickname.trim(), traits: finalTraits };
    saveUser(profile);
    router.push("/team/create");
  }

  if (showNickname && resultRole) {
    const info = ROLE_LABELS[resultRole];
    return (
      <>
        <AppHeader step={3} totalSteps={3} />
        <main className="py-12 px-4">
          <div className="max-w-[480px] mx-auto text-center">
            <div className="text-5xl mb-4">{info.emoji}</div>
            <h2 className="text-2xl font-bold text-ink mb-2">{info.name}</h2>
            <p className="text-sm text-body mb-8">{info.desc}</p>
            <div className="mb-6 text-left">
              <label className="block text-sm font-semibold text-ink mb-2">
                닉네임을 입력해주세요
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="예: 민준"
                maxLength={10}
                className="w-full border border-hairline rounded-sm px-4 h-12 text-base text-ink focus:outline-none focus:border-primary"
              />
            </div>
            <Button fullWidth onClick={handleSave} disabled={!nickname.trim()}>
              팀 만들러 가기
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader step={1} totalSteps={3} />
      <main className="py-10 px-4 bg-canvas-warm min-h-screen">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">나의 과팅 스타일은?</h1>
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
