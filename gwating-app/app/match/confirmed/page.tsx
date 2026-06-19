"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
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

function formatHour(time: string): string {
  const h = parseInt(time, 10);
  if (h === 0) return "오전 12시";
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "오후 12시";
  return `오후 ${h - 12}시`;
}

export default function ConfirmedPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<MatchFlowState | null>(null);

  useEffect(() => {
    setFlow(loadMatchFlow());
  }, []);

  if (!flow?.schedule.confirmedDate) {
    return (
      <PageShell className="items-center justify-center text-center">
        <p className="text-sm font-medium text-muted">일정 정보가 없어요.</p>
        <div className="mt-6 w-full">
          <Button fullWidth onClick={() => router.push("/match/schedule")}>
            날짜 다시 정하기
          </Button>
        </div>
      </PageShell>
    );
  }

  const team = loadTeam();
  const mood = flow.matchedTeam.mood;
  const questions = team ? QUESTIONS_BY_MOOD[mood] ?? [] : [];
  const daysLeft = getDaysUntil(flow.schedule.confirmedDate);
  const distribution = distributeQuestions(questions.length, Math.max(1, daysLeft));

  return (
    <PageShell mood="dark">
      <AuroraBlob className="-right-24 -top-20 h-72 w-72 bg-[#FF3D5A]/15" />
      <p className="mt-8 text-[10px] font-extrabold tracking-[3.5px] text-[#FFB9A3]">
        ✦ 과팅 확정
      </p>
      <div className="mt-2 animate-shine bg-shine-text bg-[length:200%_auto] bg-clip-text text-[80px] font-black leading-none tracking-[-4px] text-transparent">
        D-{daysLeft}
      </div>
      <p className="mt-3 text-[15px] font-bold text-[#EDE9E2]">
        {formatDate(flow.schedule.confirmedDate)}
        {flow.schedule.confirmedTime && ` · ${formatHour(flow.schedule.confirmedTime)}`}
      </p>

      <Card variant="glass" className="mt-7 px-5 py-1">
        <div className="flex items-center justify-between border-b border-[#F2EEE7]/10 py-3.5 text-[13px]">
          <span className="font-semibold text-[#EDE9E2]/50">날짜</span>
          <span className="font-extrabold">{formatDate(flow.schedule.confirmedDate)}</span>
        </div>
        {flow.schedule.confirmedTime && (
          <div className="flex items-center justify-between border-b border-[#F2EEE7]/10 py-3.5 text-[13px]">
            <span className="font-semibold text-[#EDE9E2]/50">시간</span>
            <span className="font-extrabold">
              {formatHour(flow.schedule.confirmedTime)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between py-3.5 text-[13px]">
          <span className="font-semibold text-[#EDE9E2]/50">장소</span>
          <span className="font-extrabold text-[#FFB9A3]">D-1에 공개돼요</span>
        </div>
      </Card>

      <Card variant="glass" className="mt-3.5">
        <p className="text-[10px] font-extrabold tracking-[2.5px] text-[#FFB9A3]">
          Q&A 공개 일정
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {distribution.map((count, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-10 font-extrabold">D-{daysLeft - i}</span>
              <div className="flex gap-1">
                {Array.from({ length: count }).map((_, j) => (
                  <span
                    key={j}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FF7A3D]/15 text-[8px] font-bold text-[#FFB9A3]"
                  >
                    Q
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] font-medium text-[#EDE9E2]/45">
          매일 Q&A로 상대팀을 알아가요
        </p>
      </Card>

      <div className="mt-auto pt-6">
        <Button variant="electric" fullWidth onClick={() => router.push("/match/qa")}>
          Q&A 시작하기
        </Button>
      </div>
    </PageShell>
  );
}
