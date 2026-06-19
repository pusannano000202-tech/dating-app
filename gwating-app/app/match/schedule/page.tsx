"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { loadMatchFlow, saveMatchFlow } from "@/lib/storage";
import { getEarliestIntersection } from "@/lib/schedule";

const TIME_SLOTS = ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

function getCalendarDays(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// skeleton: 상대팀이 선택한 날짜 mock
const MOCK_THEIR_DATES = (() => {
  const days = getCalendarDays();
  return [days[3], days[5], days[6], days[8], days[10], days[11]];
})();

const MOCK_THEIR_TIMES = ["18:00", "19:00", "20:00"];

export default function SchedulePage() {
  const router = useRouter();
  const [step, setStep] = useState<"date" | "time">("date");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const calendarDays = getCalendarDays();

  function toggleDate(d: string) {
    setSelectedDates((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function toggleTime(t: string) {
    setSelectedTimes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  function handleDateNext() {
    if (selectedDates.length === 0) return;
    setStep("time");
  }

  function handleConfirm() {
    if (selectedTimes.length === 0) return;
    const confirmedDate = getEarliestIntersection(
      selectedDates.sort(),
      MOCK_THEIR_DATES
    );
    const confirmedTime = getEarliestIntersection(
      selectedTimes.sort(),
      MOCK_THEIR_TIMES
    );
    const flow = loadMatchFlow();
    if (!flow) return;
    saveMatchFlow({
      ...flow,
      schedule: {
        ...flow.schedule,
        availableDates: selectedDates,
        availableTimes: selectedTimes,
        confirmedDate: confirmedDate ?? selectedDates.sort()[0],
        confirmedTime: confirmedTime ?? selectedTimes.sort()[0],
      },
    });
    router.push("/match/confirmed");
  }

  function formatDateLabel(iso: string) {
    const d = new Date(iso);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
  }

  if (step === "time") {
    return (
      <>
        <AppHeader />
        <PageShell className="pt-7">
          <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ SCHEDULE</p>
          <h1 className="mt-2 text-2xl font-black leading-[1.3] tracking-[-0.8px]">
            가능한 시간을
            <br />
            골라주세요
          </h1>
          <p className="mt-2 text-xs font-medium text-muted">
            두 팀이 겹치는 가장 빠른 시간으로 자동 확정돼요
          </p>
          <div className="mt-7 grid grid-cols-3 gap-2.5">
            {TIME_SLOTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTime(t)}
                className={`rounded-btn border-[1.5px] py-3.5 text-sm font-bold transition-all active:scale-[0.97] ${
                  selectedTimes.includes(t)
                    ? "border-transparent bg-electric text-white shadow-glow"
                    : "border-line bg-white text-muted"
                }`}
              >
                오후 {parseInt(t) - 12 > 0 ? parseInt(t) - 12 : parseInt(t)}시
              </button>
            ))}
          </div>
          <p className="mt-5 text-center text-[10px] font-semibold text-muted">
            {selectedTimes.length}개 선택됨
          </p>
          <div className="mt-auto pt-6">
            <Button fullWidth disabled={selectedTimes.length === 0} onClick={handleConfirm}>
              확정하기
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <PageShell className="pt-7">
        <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ SCHEDULE</p>
        <h1 className="mt-2 text-2xl font-black leading-[1.3] tracking-[-0.8px]">
          가능한 날짜를
          <br />
          골라주세요
        </h1>
        <p className="mt-2 text-xs font-medium leading-relaxed text-muted">
          한 달 내 가능한 날을 모두 선택해주세요.
          <br />
          <span className="font-bold text-[#E5402E]">●</span> 상대팀도 가능한 날이에요
        </p>
        <div className="mt-6 grid grid-cols-4 gap-2">
          {calendarDays.map((d) => {
            const isMine = selectedDates.includes(d);
            const isBoth = isMine && MOCK_THEIR_DATES.includes(d);
            const isTheirOnly = !isMine && MOCK_THEIR_DATES.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDate(d)}
                className={`relative rounded-[12px] border-[1.5px] py-2.5 text-xs font-bold transition-all active:scale-[0.95] ${
                  isBoth
                    ? "border-transparent bg-electric text-white shadow-glow"
                    : isMine
                    ? "border-[#FF9D7E] bg-[#FFF0EA] text-[#E5402E]"
                    : isTheirOnly
                    ? "border-line bg-white text-ink"
                    : "border-line bg-white text-muted"
                }`}
              >
                {formatDateLabel(d)}
                {isTheirOnly && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-center text-[10px] font-semibold text-muted">
          {selectedDates.length}개 선택됨 · 겹치는 날{" "}
          {selectedDates.filter((d) => MOCK_THEIR_DATES.includes(d)).length}개
        </p>
        <div className="mt-auto pt-6">
          <Button fullWidth disabled={selectedDates.length === 0} onClick={handleDateNext}>
            다음 — 시간 선택
          </Button>
        </div>
      </PageShell>
    </>
  );
}
