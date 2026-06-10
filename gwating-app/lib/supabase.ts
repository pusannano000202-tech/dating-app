import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * 공용 Supabase 브라우저 클라이언트.
 * 환경변수는 .env.local 에 설정한다 (anon key 는 클라이언트 노출 전제 키).
 *
 * NEXT_PUBLIC_SUPABASE_URL
 * NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // createClient("","") 는 import 시점에 throw 하므로(Supabase v2),
  // 미설정 환경에서는 클라이언트를 아예 만들지 않고 null 로 둔다.
  // 호출부는 반드시 isSupabaseConfigured 로 가드한 뒤 사용한다.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다."
  );
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
