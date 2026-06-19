"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { loadMatchFlow, saveMatchFlow, loadTeam } from "@/lib/storage";
import { QUESTIONS_BY_MOOD, QAQuestion } from "@/data/questions-by-mood";
import { distributeQuestions, getTodayMemberIndex, getChemistryComment } from "@/lib/qa";
import { MatchFlowState, QAAnswer } from "@/types/match-flow";
import { TeamProfile } from "@/types/matching";

type ViewState = "question" | "waiting" | "revealed" | "history";

export default function QAPage() {
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
      <PageShell mood="dark">
        <AuroraBlobBg />
        <div className="mt-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF7A3D]/25 bg-[#FF7A3D]/10 px-3 py-1.5 text-[10px] font-bold text-[#FFB9A3]">
            <span className="dot-live h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
            상대팀 답변이 공개됐어요!
          </span>
          <p className="mt-4 text-base font-extrabold leading-snug text-[#F2EEE7]">
            {todayQuestion?.text}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Card variant="glass">
            <p className="text-[9px] font-extrabold tracking-[2px] text-[#FFB9A3]">우리 팀원 답변</p>
            <p className="mt-2 text-sm font-extrabold">{latestAnswer.myAnswer}</p>
          </Card>
          <Card variant="glass">
            <p className="text-[9px] font-extrabold tracking-[2px] text-lilac">상대팀원 답변</p>
            <p className="mt-2 text-sm font-extrabold">{latestAnswer.theirAnswer}</p>
          </Card>
        </div>

        <Card variant="glass" className="mt-3 p-4 text-center">
          <p className="text-xs font-medium leading-relaxed text-[#EDE9E2]/70">
            {getChemistryComment(latestAnswer.myAnswer, latestAnswer.theirAnswer ?? "")}
          </p>
        </Card>

        <div className="mt-auto pt-6">
          <Button variant="glass" fullWidth onClick={() => setView("history")}>
            전체 기록 보기
          </Button>
        </div>
      </PageShell>
    );
  }

  if (view === "history") {
    return (
      <PageShell mood="dark">
        <AuroraBlobBg />
        <p className="mt-6 text-[10px] font-extrabold tracking-[3px] text-[#FFB9A3]">✦ Q&A 기록</p>
        <h1 className="mt-2 text-xl font-black tracking-[-0.6px]">지금까지 나눈 대화</h1>
        <div className="mt-5 flex flex-col gap-3">
          {flow?.qaAnswers.map((a, i) => (
            <Card key={i} variant="glass">
              <p className="text-[10px] font-extrabold tracking-[2px] text-[#EDE9E2]/40">
                Q{i + 1}
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="w-12 shrink-0 text-[10px] font-bold text-[#FFB9A3]">우리팀</span>
                  <span className="text-xs font-medium">{a.myAnswer}</span>
                </div>
                {a.theirAnswer && (
                  <div className="flex items-start gap-2">
                    <span className="w-12 shrink-0 text-[10px] font-bold text-lilac">상대팀</span>
                    <span className="text-xs font-medium">{a.theirAnswer}</span>
                  </div>
                )}
              </div>
              {a.theirAnswer && (
                <p className="mt-2.5 text-[10px] font-medium italic text-[#EDE9E2]/45">
                  {getChemistryComment(a.myAnswer, a.theirAnswer)}
                </p>
              )}
            </Card>
          ))}
        </div>
        {todayQuestion && isMyTurn && (
          <div className="mt-auto pt-6">
            <Button variant="electric" fullWidth onClick={() => setView("question")}>
              오늘 질문 답하기
            </Button>
          </div>
        )}
      </PageShell>
    );
  }

  // 내 차례 아닐 때
  if (!isMyTurn) {
    return (
      <PageShell mood="dark" className="items-center justify-center text-center">
        <AuroraBlobBg />
        <p className="text-[10px] font-extrabold tracking-[3px] text-[#FFB9A3]">✦ 오늘의 질문</p>
        <h2 className="mt-3 text-lg font-black">오늘은 {todayMemberName}님 차례예요</h2>
        <p className="mt-2 text-sm font-medium text-[#EDE9E2]/55">
          답변이 완료되면 대화를 볼 수 있어요
        </p>
        <div className="mt-8 w-full">
          <Button variant="glass" fullWidth onClick={() => setView("history")}>
            이전 기록 보기
          </Button>
        </div>
      </PageShell>
    );
  }

  // 내 차례 + 질문
  const totalQ = QUESTIONS_BY_MOOD[flow?.matchedTeam.mood ?? "comfortableTalk"]?.length ?? 5;
  const answered = flow?.qaAnswers.length ?? 0;

  return (
    <PageShell mood="dark">
      <AuroraBlobBg />
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold tracking-[3px] text-[#FFB9A3]">
            ✦ 오늘의 질문
          </span>
          <span className="text-[10px] font-bold text-[#EDE9E2]/45">
            {answered + 1} / {totalQ}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#F2EEE7]/10">
          <div
            className="h-full rounded-full bg-electric"
            style={{ width: `${(answered / totalQ) * 100}%` }}
          />
        </div>
      </div>

      <h1 className="mt-7 text-[22px] font-black leading-[1.4] tracking-[-0.6px] text-[#F2EEE7]">
        {todayQuestion?.text}
      </h1>

      <div className="mt-6 flex flex-col gap-2.5">
        {todayQuestion?.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setSelectedAnswer(choice)}
            className={`rounded-2xl border-[1.5px] px-4 py-3.5 text-left text-sm font-semibold transition-all active:scale-[0.98] ${
              selectedAnswer === choice
                ? "border-[#FF7A3D] bg-[#FF7A3D]/15 text-white"
                : "border-[#F2EEE7]/10 bg-[#F2EEE7]/[0.05] text-[#EDE9E2]"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Button variant="electric" fullWidth disabled={!selectedAnswer} onClick={handleSubmit}>
          답변 제출하고 상대 보기
        </Button>
      </div>
    </PageShell>
  );
}

function AuroraBlobBg() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 animate-drift rounded-full bg-[#FF3D5A]/12 blur-[58px]"
    />
  );
}
