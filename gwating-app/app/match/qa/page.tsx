"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { loadMatchFlow, saveMatchFlow, loadTeam } from "@/lib/storage";
import { QUESTIONS_BY_MOOD, QAQuestion } from "@/data/questions-by-mood";
import { distributeQuestions, getTodayMemberIndex, getChemistryComment } from "@/lib/qa";
import { MatchFlowState, QAAnswer } from "@/types/match-flow";
import { TeamProfile } from "@/types/matching";

type ViewState = "question" | "waiting" | "revealed" | "history";

export default function QAPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<MatchFlowState | null>(null);
  const [team, setTeam] = useState<TeamProfile | null>(null);
  const [view, setView] = useState<ViewState>("question");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [todayQuestion, setTodayQuestion] = useState<QAQuestion | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [todayMemberName, setTodayMemberName] = useState("");

  useEffect(() => {
    const f = loadMatchFlow();
    const t = loadTeam();
    if (!f || !t) return;
    setFlow(f);
    setTeam(t);

    const questions = QUESTIONS_BY_MOOD[f.matchedTeam.mood] ?? [];
    const daysLeft = 5; // skeleton: 실제는 confirmedDate 기반 계산
    const distribution = distributeQuestions(questions.length, daysLeft);
    const questionsForToday = distribution[f.currentQADay - 1] ?? 0;
    const answeredToday = f.qaAnswers.filter(
      (a) => a.questionId.includes(`day${f.currentQADay}`)
    ).length;

    if (questionsForToday > 0 && answeredToday < questionsForToday) {
      setTodayQuestion(questions[f.qaAnswers.length] ?? questions[0]);
    }

    const memberIdx = getTodayMemberIndex(f.currentQADay, t.members.length);
    const todayMember = t.members[memberIdx];
    setTodayMemberName(todayMember?.nickname ?? "");
    setIsMyTurn(todayMember?.isLeader === true);

    if (f.qaAnswers.length > 0) setView("history");
  }, []);

  function handleSubmit() {
    if (!selectedAnswer || !flow || !team || !todayQuestion) return;

    // skeleton: 상대방 답변은 mock
    const mockTheirAnswers = todayQuestion.choices;
    const mockTheirAnswer = mockTheirAnswers[Math.floor(Math.random() * mockTheirAnswers.length)];

    const newAnswer: QAAnswer = {
      questionId: `day${flow.currentQADay}-${todayQuestion.id}`,
      myAnswer: selectedAnswer,
      theirAnswer: mockTheirAnswer,
      memberId: team.members.find((m) => m.isLeader)?.nickname ?? "",
      theirMemberId: "상대팀원",
    };

    const updated: MatchFlowState = {
      ...flow,
      qaAnswers: [...flow.qaAnswers, newAnswer],
    };
    saveMatchFlow(updated);
    setFlow(updated);
    setView("revealed");
  }

  const latestAnswer = flow?.qaAnswers[flow.qaAnswers.length - 1];

  if (view === "revealed" && latestAnswer) {
    return (
      <>
        <AppHeader />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto flex flex-col gap-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 bg-primary-soft border border-primary-disabled rounded-full px-3 py-1.5 text-[10px] font-bold text-primary mb-3">
                <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                상대팀 답변이 공개됐어요!
              </div>
              <p className="text-sm font-black text-ink mb-1 leading-snug">
                {todayQuestion?.text}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="bg-gradient-to-br from-primary-soft to-[#ffe4ed] border-[1.5px] border-primary-disabled rounded-[14px] p-4">
                <div className="text-[9px] font-bold text-[#ff9ab0] uppercase tracking-wide mb-2">우리 팀원 답변</div>
                <div className="text-sm font-black text-ink">{latestAnswer.myAnswer}</div>
              </div>
              <div className="bg-gradient-to-br from-[#f0f5ff] to-[#e8e8ff] border-[1.5px] border-[#cce0ff] rounded-[14px] p-4">
                <div className="text-[9px] font-bold text-[#90b4e8] uppercase tracking-wide mb-2">상대팀원 답변</div>
                <div className="text-sm font-black text-ink">{latestAnswer.theirAnswer}</div>
              </div>
            </div>

            <div className="bg-surface-soft rounded-[12px] p-3 text-center text-xs text-muted leading-relaxed">
              {getChemistryComment(latestAnswer.myAnswer, latestAnswer.theirAnswer ?? "")}
            </div>

            <Button fullWidth onClick={() => setView("history")}>
              전체 기록 보기
            </Button>
          </div>
        </main>
      </>
    );
  }

  if (view === "history") {
    return (
      <>
        <AppHeader />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto">
            <h1 className="text-xl font-black text-ink tracking-[-0.5px] mb-1">Q&A 기록</h1>
            <p className="text-xs text-muted mb-6">지금까지 나눈 대화예요</p>
            <div className="flex flex-col gap-3 mb-6">
              {flow?.qaAnswers.map((a, i) => (
                <div key={i} className="bg-surface-soft rounded-[14px] p-4">
                  <p className="text-[10px] font-bold text-muted mb-3 uppercase tracking-wide">Q{i + 1}</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-start">
                      <span className="text-[10px] font-bold text-primary w-12 shrink-0">우리팀</span>
                      <span className="text-xs text-ink">{a.myAnswer}</span>
                    </div>
                    {a.theirAnswer && (
                      <div className="flex gap-2 items-start">
                        <span className="text-[10px] font-bold text-[#4f9eff] w-12 shrink-0">상대팀</span>
                        <span className="text-xs text-ink">{a.theirAnswer}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted mt-2 italic">
                    {a.theirAnswer ? getChemistryComment(a.myAnswer, a.theirAnswer) : ""}
                  </p>
                </div>
              ))}
            </div>
            {todayQuestion && isMyTurn && (
              <Button fullWidth onClick={() => setView("question")}>
                오늘 질문 답하기 →
              </Button>
            )}
          </div>
        </main>
      </>
    );
  }

  // 내 차례 아닐 때
  if (!isMyTurn) {
    return (
      <>
        <AppHeader />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto text-center">
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="text-lg font-black text-ink mb-2">오늘은 {todayMemberName}님 차례예요</h2>
            <p className="text-sm text-muted mb-8">답변이 완료되면 대화를 볼 수 있어요</p>
            <Button variant="secondary" fullWidth onClick={() => setView("history")}>
              이전 기록 보기
            </Button>
          </div>
        </main>
      </>
    );
  }

  // 내 차례 + 질문
  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto flex flex-col gap-5">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold text-primary">오늘의 질문</span>
              <span className="text-[10px] text-muted font-bold">
                {(flow?.qaAnswers.length ?? 0) + 1} / {QUESTIONS_BY_MOOD[flow?.matchedTeam.mood ?? "comfortableTalk"]?.length ?? 5}
              </span>
            </div>
            <div className="h-1 bg-surface-soft rounded-full">
              <div
                className="h-full bg-gradient-to-r from-primary to-[#ff8a65] rounded-full"
                style={{
                  width: `${((flow?.qaAnswers.length ?? 0) / (QUESTIONS_BY_MOOD[flow?.matchedTeam.mood ?? "comfortableTalk"]?.length ?? 5)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-[16px] overflow-hidden shadow-card">
            <div className="bg-gradient-to-br from-[#1a1230] to-[#2d1f45] p-5 text-center">
              <div className="inline-block bg-[rgba(255,90,111,0.2)] text-[#ff9ab0] text-[9px] font-bold rounded-full px-3 py-1 mb-3 border border-[rgba(255,90,111,0.25)]">
                📬 오늘 질문 도착
              </div>
              <p className="text-sm font-black text-white leading-snug">{todayQuestion?.text}</p>
            </div>
            <div className="bg-white p-4">
              <div className="flex flex-col gap-2 mb-4">
                {todayQuestion?.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setSelectedAnswer(choice)}
                    className={`text-left px-4 py-3 rounded-[10px] border-[1.5px] text-sm font-medium transition-all ${
                      selectedAnswer === choice
                        ? "border-primary bg-primary-soft text-primary font-bold"
                        : "border-hairline text-body hover:border-primary"
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              <Button fullWidth disabled={!selectedAnswer} onClick={handleSubmit}>
                답변 제출하고 상대 보기 →
              </Button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
