import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "부팅 — 부산대 과팅",
  description: "당신의 연애세포를 부팅하세요! 부산대생 전용 팀 과팅 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-canvas text-ink">{children}</body>
    </html>
  );
}
