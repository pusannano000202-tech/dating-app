import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "부산대 과팅 매칭",
  description: "부산대생 전용 그룹 과팅 매칭 서비스 베타",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-canvas text-ink">{children}</body>
    </html>
  );
}
