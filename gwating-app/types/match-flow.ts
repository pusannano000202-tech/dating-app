import { MoodKey } from "./matching";

export type MatchedTeamInfo = {
  teamName?: string;       // D-day까지 비공개
  school: string;
  ageRange: string;
  maleCount: number;
  femaleCount: number;
  mood: MoodKey;
};

export type ScheduleState = {
  availableDates: string[];   // "YYYY-MM-DD" 형식
  availableTimes: string[];   // "18:00", "19:00" 등
  confirmedDate?: string;
  confirmedTime?: string;
  venue?: string;             // skeleton: 추후 DB 연결
};

export type QAAnswer = {
  questionId: string;
  myAnswer: string;
  theirAnswer?: string;       // 상대방 제출 전엔 undefined
  memberId: string;           // 답변한 팀원 nickname
  theirMemberId?: string;
};

export type MatchFlowState = {
  matchId: string;
  score: number;
  matchedTeam: MatchedTeamInfo;
  schedule: ScheduleState;
  qaAnswers: QAAnswer[];
  currentQADay: number;
  currentRotationIndex: number;   // 오늘 순번 팀원 인덱스
};
