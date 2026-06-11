import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "부팅 — 부산대 과팅",
  description: "연애세포, 다시 부팅할 시간. 부산대생 전용 팀 과팅 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-[100dvh] bg-backdrop font-sans text-ink sm:flex sm:items-center sm:justify-center sm:py-6">
        <div className="relative h-[100dvh] w-full bg-paper sm:h-[min(860px,calc(100dvh-48px))] sm:max-w-[420px] sm:overflow-hidden sm:rounded-[40px] sm:shadow-frame">
          <div className="h-full overflow-y-auto">{children}</div>
        </div>
      </body>
    </html>
  );
}
