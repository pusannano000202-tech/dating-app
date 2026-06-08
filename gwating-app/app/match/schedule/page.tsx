"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
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
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto">
            <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">가능한 시간을 골라주세요</h1>
            <p className="text-xs text-muted mb-8">두 팀이 겹치는 가장 빠른 시간으로 자동 확정돼요</p>
            <div className="grid grid-cols-3 gap-3 mb-8">
              {TIME_SLOTS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTime(t)}
                  className={`py-3 rounded-[12px] text-sm font-bold border-[1.5px] transition-all ${
                    selectedTimes.includes(t)
                      ? "bg-gradient-to-br from-primary to-[#ff7e5f] text-white border-primary shadow-btn-primary"
                      : "border-hairline text-muted hover:border-primary hover:text-primary"
                  }`}
                >
                  오후 {parseInt(t) - 12 > 0 ? parseInt(t) - 12 : parseInt(t)}시
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted text-center mb-6">
              {selectedTimes.length}개 선택됨
            </p>
            <Button fullWidth disabled={selectedTimes.length === 0} onClick={handleConfirm}>
              확정하기 →
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto">
          <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">가능한 날짜를 골라주세요</h1>
          <p className="text-xs text-muted mb-6">
            한 달 내 가능한 날 모두 선택해주세요.<br />
            <span className="text-primary font-bold">●</span> 상대팀도 가능한 날이에요
          </p>
          <div className="grid grid-cols-4 gap-2 mb-8">
            {calendarDays.map((d) => {
              const isMine = selectedDates.includes(d);
              const isBoth = isMine && MOCK_THEIR_DATES.includes(d);
              const isTheirOnly = !isMine && MOCK_THEIR_DATES.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDate(d)}
                  className={`py-2.5 rounded-[10px] text-xs font-bold border-[1.5px] transition-all relative ${
                    isBoth
                      ? "bg-gradient-to-br from-primary to-[#ff7e5f] text-white border-primary shadow-btn-primary"
                      : isMine
                      ? "bg-primary-soft text-primary border-primary-disabled"
                      : isTheirOnly
                      ? "border-primary-disabled text-primary bg-white"
                      : "border-hairline text-muted"
                  }`}
                >
                  {formatDateLabel(d)}
                  {isTheirOnly && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted text-center mb-6">
            {selectedDates.length}개 선택됨 · 겹치는 날 {selectedDates.filter((d) => MOCK_THEIR_DATES.includes(d)).length}개
          </p>
          <Button fullWidth disabled={selectedDates.length === 0} onClick={handleDateNext}>
            다음 — 시간 선택 →
          </Button>
        </div>
      </main>
    </>
  );
}
