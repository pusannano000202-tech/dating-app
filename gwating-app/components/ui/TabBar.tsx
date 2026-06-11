"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", label: "홈" },
  { href: "/match/result", label: "매칭" },
  { href: "/match/chat", label: "채팅" },
  { href: "/team/demo", label: "마이" },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-paper/80 px-2 pb-6 pt-3 backdrop-blur-xl">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href !== "/home" && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
              active ? "text-[#FF4D3D]" : "text-[#B5AFA4]"
            }`}
          >
            <TabIcon name={tab.label} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabIcon({ name }: { name: (typeof TABS)[number]["label"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "홈":
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "매칭":
      return (
        <svg {...common}>
          <path d="M13 2L4.5 13.5h5.5L9 22l8.5-11.5H12L13 2z" />
        </svg>
      );
    case "채팅":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
        </svg>
      );
  }
}
