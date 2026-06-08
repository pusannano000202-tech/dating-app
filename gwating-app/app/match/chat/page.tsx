"use client";

import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
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
    <>
      <AppHeader />
      <div className="flex flex-col h-[calc(100vh-44px)] bg-white max-w-[560px] mx-auto">
        {/* 채팅 헤더 */}
        <div className="px-4 py-3 bg-surface-soft border-b border-hairline-soft flex items-center gap-3">
          <div className="flex">
            <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-xs">👑</div>
            <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-[#7c5cbf] to-[#a07ee8] flex items-center justify-center text-xs -ml-1.5 border-2 border-white">👑</div>
          </div>
          <div className="flex-1">
            <div className="text-xs font-black text-ink">팀장 채널</div>
            <div className="text-[10px] text-muted">오늘만 열리는 채팅이에요</div>
          </div>
          <span className="text-[9px] bg-mint text-mint-ink border border-[#bdebd3] rounded-full px-2 py-0.5 font-bold">
            live
          </span>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {error && (
            <div className="text-[11px] text-center text-[#c0392b] bg-[#fdecea] rounded-[10px] px-3 py-2">
              {error}
            </div>
          )}
          {ready && !error && messages.length === 0 && (
            <div className="text-[11px] text-center text-muted py-6">
              아직 메시지가 없어요. 먼저 인사를 건네보세요 👋
            </div>
          )}
          {messages.map((m) => {
            const isMe = m.sender === myName;
            return (
              <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  {!isMe && <span className="text-[9px] text-muted px-1">{m.sender}</span>}
                  <div
                    className={`px-3 py-2 rounded-[12px] text-sm leading-snug ${
                      isMe
                        ? "bg-gradient-to-r from-primary to-[#ff7e5f] text-white rounded-br-[4px]"
                        : "bg-surface-soft text-ink rounded-bl-[4px]"
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-[9px] text-muted">{formatTime(m.created_at)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* 입력창 */}
        <div className="px-4 py-3 border-t border-hairline-soft flex gap-2 items-center">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="메시지 입력…"
            disabled={!isSupabaseConfigured}
            className="flex-1 bg-surface-soft rounded-full px-4 py-2 text-sm text-ink focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!isSupabaseConfigured || !input.trim()}
            className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-[#ff7e5f] flex items-center justify-center text-white text-sm font-bold shadow-btn-primary disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
