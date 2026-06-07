"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";

type Message = { text: string; isMe: boolean; time: string };

const INITIAL_MESSAGES: Message[] = [
  { text: "안녕하세요! 오늘 7시에 봬요 😊", isMe: false, time: "오후 2:14" },
  { text: "네! 저희도 기대하고 있어요 ㅎㅎ", isMe: true, time: "오후 2:16" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim()) return;
    const now = new Date();
    const time = `오후 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setMessages((prev) => [...prev, { text: input.trim(), isMe: true, time }]);
    setInput("");
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
          <span className="text-[9px] bg-amber text-amber-ink border border-[#ffe0a0] rounded-full px-2 py-0.5 font-bold">
            skeleton
          </span>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${m.isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                <div
                  className={`px-3 py-2 rounded-[12px] text-sm leading-snug ${
                    m.isMe
                      ? "bg-gradient-to-r from-primary to-[#ff7e5f] text-white rounded-br-[4px]"
                      : "bg-surface-soft text-ink rounded-bl-[4px]"
                  }`}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-muted">{m.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 입력창 */}
        <div className="px-4 py-3 border-t border-hairline-soft flex gap-2 items-center">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="메시지 입력…"
            className="flex-1 bg-surface-soft rounded-full px-4 py-2 text-sm text-ink focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-[#ff7e5f] flex items-center justify-center text-white text-sm font-bold shadow-btn-primary"
          >
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
