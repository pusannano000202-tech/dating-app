import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * 부산대 학교 메일(@pusan.ac.kr) 인증.
 * Supabase Auth의 이메일 OTP로 인증코드를 발송/검증하고, 검증에 성공하면
 * Supabase가 발급한 세션(JWT)을 그대로 유지한다. 배지 상태는 이 세션을
 * `auth.getUser()`로 서버에 검증받아 판단하므로, 클라이언트가 임의로
 * localStorage 값을 조작해 배지를 위조할 수 없다.
 */

export const SCHOOL_EMAIL_DOMAIN = "pusan.ac.kr";

export type SchoolVerification = {
  emailMasked: string;
  verifiedAt: string;
};

export function isSchoolEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${SCHOOL_EMAIL_DOMAIN}`);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visibleLen = Math.min(2, local.length);
  const visible = local.slice(0, visibleLen);
  return `${visible}${"*".repeat(Math.max(local.length - visibleLen, 1))}@${domain}`;
}

/** 서버가 확인해 준 사용자 정보에서만 인증 배지 상태를 도출한다. */
function toVerification(user: User | null | undefined): SchoolVerification | null {
  const email = user?.email;
  if (!email || !user?.email_confirmed_at || !isSchoolEmail(email)) return null;
  return {
    emailMasked: maskEmail(email),
    verifiedAt: user.email_confirmed_at,
  };
}

/**
 * 현재 세션을 Supabase 서버에 검증받아 인증 배지 상태를 가져온다.
 * (`getSession`과 달리 `getUser`는 로컬 토큰을 그대로 믿지 않고 서버에 재확인한다.)
 */
export async function getSchoolVerification(): Promise<SchoolVerification | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toVerification(data.user);
}

/** Supabase Auth가 영문으로 내려주는 흔한 오류를 한국어 안내문으로 바꾼다. */
function translateAuthError(message: string): string {
  const waitMatch = message.match(/after (\d+) seconds?/i);
  if (waitMatch) return `잠시 후 다시 시도해주세요 (약 ${waitMatch[1]}초 후 재요청 가능해요).`;
  if (/invalid.*(otp|token)|token.*expired/i.test(message)) {
    return "인증코드가 올바르지 않거나 만료됐어요. 다시 받아서 시도해주세요.";
  }
  if (/rate limit/i.test(message)) {
    return "요청이 너무 잦아요. 잠시 후 다시 시도해주세요.";
  }
  if (/email address.*is invalid/i.test(message)) {
    return "올바른 이메일 형식이 아니에요. 학교 메일 주소를 다시 확인해주세요.";
  }
  return message;
}

export async function requestVerificationCode(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = email.trim();
  if (!isSchoolEmail(trimmed)) {
    return { ok: false, error: `부산대 학교 메일(@${SCHOOL_EMAIL_DOMAIN})만 인증할 수 있어요.` };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: "인증 서비스에 연결할 수 없어요. 잠시 후 다시 시도해주세요." };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { shouldCreateUser: true },
  });
  if (error) return { ok: false, error: translateAuthError(error.message) };
  return { ok: true };
}

export async function confirmVerificationCode(
  email: string,
  code: string
): Promise<{ ok: boolean; error?: string; verification?: SchoolVerification }> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: "인증 서비스에 연결할 수 없어요. 잠시 후 다시 시도해주세요." };
  }
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: "email",
  });
  if (error || !data.session) {
    return {
      ok: false,
      error: error ? translateAuthError(error.message) : "인증코드가 올바르지 않아요.",
    };
  }
  // data.user는 클라이언트가 받은 응답일 뿐이므로, 배지 상태는 서버에 한 번 더 확인받는다.
  const verification = await getSchoolVerification();
  if (!verification) {
    return { ok: false, error: "인증 확인에 실패했어요. 다시 시도해주세요." };
  }
  return { ok: true, verification };
}
