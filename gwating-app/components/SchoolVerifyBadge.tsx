"use client";

import { useState } from "react";
import {
  SCHOOL_EMAIL_DOMAIN,
  confirmVerificationCode,
  loadSchoolVerification,
  requestVerificationCode,
  type SchoolVerification,
} from "@/lib/schoolVerification";

type Step = "email" | "code";

export function SchoolVerifyBadge() {
  const [verification, setVerification] = useState<SchoolVerification | null>(() =>
    loadSchoolVerification()
  );
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setOpen(true);
    setStep("email");
    setError(null);
    setCode("");
  }

  async function handleSendCode() {
    setError(null);
    setLoading(true);
    const res = await requestVerificationCode(email);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "코드 발송에 실패했어요.");
      return;
    }
    setStep("code");
  }

  async function handleVerify() {
    setError(null);
    setLoading(true);
    const res = await confirmVerificationCode(email, code);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "인증에 실패했어요.");
      return;
    }
    setVerification(loadSchoolVerification());
    setOpen(false);
  }

  if (verification) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-sky-ink bg-sky border border-[#cfe6fb] rounded-full px-2.5 py-1">
        🎓 부산대 재학생 인증 완료
        <span className="text-[9px] font-medium text-muted">{verification.emailMasked}</span>
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="text-[11px] font-bold text-sky-ink bg-sky border border-[#cfe6fb] rounded-full px-3 py-1.5 hover:bg-[#dcedfd] transition-colors"
      >
        🎓 학교 메일로 인증하고 신뢰도 올리기
      </button>
    );
  }

  return (
    <div className="bg-sky border border-[#cfe6fb] rounded-[12px] p-4 max-w-[360px] flex flex-col gap-3">
      <div>
        <p className="text-xs font-bold text-ink mb-0.5">부산대 재학생 인증</p>
        <p className="text-[11px] text-muted">
          학교 메일(@{SCHOOL_EMAIL_DOMAIN})로 인증코드를 받아 확인해요
        </p>
      </div>

      {step === "email" && (
        <div className="flex flex-col gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`example@${SCHOOL_EMAIL_DOMAIN}`}
            className="h-10 px-3 rounded-[10px] border border-hairline-soft bg-white text-sm text-ink focus:outline-none focus:border-primary"
          />
          {error && <p className="text-[11px] text-[#c0392b]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSendCode}
              disabled={loading || !email.trim()}
              className="flex-1 h-9 rounded-full bg-gradient-to-r from-primary to-[#ff7e5f] text-white text-xs font-bold disabled:opacity-40"
            >
              {loading ? "전송 중…" : "인증코드 받기"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-3 rounded-full text-xs font-bold text-muted"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {step === "code" && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted">{email}로 전송된 6자리 코드를 입력해주세요</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            className="h-10 px-3 rounded-[10px] border border-hairline-soft bg-white text-sm text-ink tracking-[6px] text-center focus:outline-none focus:border-primary"
          />
          {error && <p className="text-[11px] text-[#c0392b]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={loading || code.length < 6}
              className="flex-1 h-9 rounded-full bg-gradient-to-r from-primary to-[#ff7e5f] text-white text-xs font-bold disabled:opacity-40"
            >
              {loading ? "확인 중…" : "인증 완료하기"}
            </button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="h-9 px-3 rounded-full text-xs font-bold text-muted"
            >
              다시 입력
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
