"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { loadMatchFlow } from "@/lib/storage";
import { MatchFlowState } from "@/types/match-flow";
import { distributeQuestions } from "@/lib/qa";
import { QUESTIONS_BY_MOOD } from "@/data/questions-by-mood";
import { loadTeam } from "@/lib/storage";

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export default function ConfirmedPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<MatchFlowState | null>(null);

  useEffect(() => {
    setFlow(loadMatchFlow());
  }, []);

  if (!flow?.schedule.confirmedDate) {
    return (
      <>
        <AppHeader />
        <main className="py-20 px-4 text-center">
          <p className="text-muted mb-4">일정 정보가 없어요.</p>
          <Button onClick={() => router.push("/match/schedule")}>날짜 다시 정하기</Button>
        </main>
      </>
    );
  }

  const team = loadTeam();
  const mood = flow.matchedTeam.mood;
  const questions = team ? QUESTIONS_BY_MOOD[mood] ?? [] : [];
  const daysLeft = getDaysUntil(flow.schedule.confirmedDate);
  const distribution = distributeQuestions(questions.length, Math.max(1, daysLeft));

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto flex flex-col gap-5">
          {/* 확정 카드 */}
          <div className="bg-gradient-to-br from-primary-soft to-[#ffe4ed] border-[1.5px] border-primary-disabled rounded-[16px] p-5 text-center">
            <div className="text-3xl mb-3">📅</div>
            <h2 className="text-base font-black text-ink mb-4">만남 일정이 확정됐어요!</h2>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">📅</span>
                <span className="text-sm font-black text-ink">{formatDate(flow.schedule.confirmedDate)}</span>
              </div>
              {flow.schedule.confirmedTime && (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-base">🕖</span>
                  <span className="text-sm font-black text-ink">
                    오후 {parseInt(flow.schedule.confirmedTime) - 12}시
                  </span>
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">📍</span>
                <span className="text-sm text-muted">장소는 D-1에 공개돼요</span>
              </div>
            </div>
          </div>

          {/* 카운트다운 */}
          <div className="bg-[#111] rounded-[16px] p-5 text-center">
            <div className="text-[10px] font-bold text-[#888] uppercase tracking-widest mb-2">만남까지</div>
            <div className="text-[48px] font-black text-white leading-none tracking-[-2px] mb-1">
              <span className="text-primary">{daysLeft}</span>일
            </div>
            <div className="text-[11px] text-[#666]">매일 Q&A로 상대팀을 알아가요</div>
          </div>

          {/* Q&A 예고 */}
          <div className="bg-surface-soft rounded-[14px] p-4">
            <p className="text-xs font-black text-ink mb-3">📦 Q&A 공개 일정</p>
            <div className="flex flex-col gap-1.5">
              {distribution.map((count, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-bold text-ink w-12">D-{daysLeft - i}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: count }).map((_, j) => (
                      <span key={j} className="w-4 h-4 rounded-full bg-primary-soft border border-primary-disabled flex items-center justify-center text-[8px] font-bold text-primary">Q</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button fullWidth onClick={() => router.push("/match/qa")}>
            Q&A 시작하기 →
          </Button>
        </div>
      </main>
    </>
  );
}
