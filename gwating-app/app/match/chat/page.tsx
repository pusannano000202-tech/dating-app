"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { loadTeam, loadMatchFlow } from "@/lib/storage";

type ChatRow = {
  id: string;
  match_id: string;
  sender: string;
  body: string;
  created_at: string;
};

const DEMO_MATCH_ID = "demo-match";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${m}`;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [input, setInput] = useState("");
  const [myName, setMyName] = useState("");
  const [matchId, setMatchId] = useState(DEMO_MATCH_ID);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 내 팀장 닉네임 / match_id 결정
  useEffect(() => {
    const team = loadTeam();
    const leader = team?.members.find((m) => m.isLeader)?.nickname;
    setMyName(leader ?? "우리팀");
    const flow = loadMatchFlow();
    setMatchId(flow?.matchId ?? DEMO_MATCH_ID);
  }, []);

  // 기존 메시지 로드 + Realtime 구독
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경변수가 설정되지 않았어요 (.env.local 확인).");
      setReady(true);
      return;
    }
    const client = supabase;
    let active = true;

    (async () => {
      const { data, error: selErr } = await client
        .from("chat_messages")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (selErr) setError(selErr.message);
      else setMessages((data as ChatRow[]) ?? []);
      setReady(true);
    })();

    const channel = client
      .channel(`chat:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as ChatRow;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row]
          );
        }
      )
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [matchId]);

  // 새 메시지 도착 시 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const body = input.trim();
    if (!body || !isSupabaseConfigured || !supabase) return;
    setInput("");
    const { error: insErr } = await supabase
      .from("chat_messages")
      .insert({ match_id: matchId, sender: myName, body });
    if (insErr) {
      setError(insErr.message);
      setInput(body); // 실패 시 입력 복원
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#F6F2EB]">
      {/* 채팅 헤더 */}
      <div className="flex items-center gap-3 border-b border-line bg-paper/85 px-5 py-3 backdrop-blur-xl">
        <div className="flex-1">
          <div className="text-[13px] font-extrabold tracking-[-0.3px] text-ink">팀장 채팅</div>
          <div className="mt-0.5 text-[10px] font-semibold text-muted">
            약속 조율용 · 오늘만 열려요
          </div>
        </div>
        <span className="rounded-full bg-electric px-2.5 py-1 text-[9px] font-extrabold tracking-[1px] text-white">
          LIVE
        </span>
      </div>

      {/* 메시지 목록 */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
        {error && (
          <div className="rounded-xl border border-[#E5402E]/25 bg-[#FFF0EA] px-3 py-2 text-center text-[11px] font-semibold text-[#C0392B]">
            {error}
          </div>
        )}
        {ready && !error && messages.length === 0 && (
          <div className="py-6 text-center text-[11px] font-medium text-muted">
            아직 메시지가 없어요. 먼저 인사를 건네보세요
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.sender === myName;
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[78%] flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="px-1.5 text-[9px] font-bold text-muted">{m.sender}</span>
                )}
                <div
                  className={`px-3.5 py-2.5 text-sm font-medium leading-snug ${
                    isMe
                      ? "rounded-[18px] rounded-br-[6px] bg-electric text-white shadow-[0_8px_18px_rgba(255,77,61,0.25)]"
                      : "rounded-[18px] rounded-bl-[6px] border border-line bg-white text-[#2B2722]"
                  }`}
                >
                  {m.body}
                </div>
                <span className="px-1 text-[9px] font-medium text-muted">
                  {formatTime(m.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="flex items-center gap-2.5 border-t border-line bg-paper/85 px-4 py-3 backdrop-blur-xl">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="메시지 입력…"
          disabled={!isSupabaseConfigured}
          className="h-11 flex-1 rounded-full border border-line bg-white px-4 text-sm text-ink focus:border-[#FF9D7E] focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!isSupabaseConfigured || !input.trim()}
          aria-label="보내기"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-electric shadow-glow transition-transform active:scale-90 disabled:opacity-40"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V6M6 12l6-6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
