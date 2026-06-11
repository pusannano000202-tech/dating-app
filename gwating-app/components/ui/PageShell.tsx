import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  mood?: "paper" | "dark";
  stagger?: boolean;
  withTabBar?: boolean;
};

export function PageShell({
  mood = "paper",
  stagger = true,
  withTabBar = false,
  className = "",
  children,
  ...props
}: Props) {
  const moodCls =
    mood === "dark" ? "bg-dusk text-[#F2EEE7]" : "bg-paper text-ink";
  return (
    <main
      className={`relative flex min-h-full flex-col overflow-hidden px-6 pt-5 ${
        withTabBar ? "pb-28" : "pb-10"
      } ${moodCls} ${stagger ? "stagger" : ""} ${className}`}
      {...props}
    >
      {children}
    </main>
  );
}
