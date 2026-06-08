import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * 부산대 학교 메일(@pusan.ac.kr) 인증.
 * Supabase Auth의 이메일 OTP를 그대로 활용해 인증코드 발송/검증을 처리하고,
 * 검증 성공 시 마스킹된 이메일만 로컬에 남긴다 (앱 자체는 Supabase Auth 세션을
 * 쓰지 않으므로 검증 직후 세션은 정리한다).
 */

export const SCHOOL_EMAIL_DOMAIN = "pusan.ac.kr";

export type SchoolVerification = {
  emailMasked: string;
  verifiedAt: string;
};

const STORAGE_KEY = "gwating_school_verified";

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

export function loadSchoolVerification(): SchoolVerification | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SchoolVerification;
  } catch {
    return null;
  }
}

function saveSchoolVerification(record: SchoolVerification): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
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
): Promise<{ ok: boolean; error?: string }> {
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
  saveSchoolVerification({
    emailMasked: maskEmail(email.trim()),
    verifiedAt: new Date().toISOString(),
  });
  await supabase.auth.signOut();
  return { ok: true };
}
