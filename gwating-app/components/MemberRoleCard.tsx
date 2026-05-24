import { MemberRole } from "@/types/matching";

const ROLES: { value: MemberRole; label: string; emoji: string }[] = [
  { value: "moodMaker",   label: "분위기 메이커형", emoji: "🔥" },
  { value: "coordinator", label: "조율자형",         emoji: "🎯" },
  { value: "considerate", label: "배려형",            emoji: "🤍" },
  { value: "reactor",     label: "리액션형",          emoji: "✨" },
];

type Props = {
  index: number;
  nickname: string;
  role: MemberRole | "";
  onNicknameChange: (val: string) => void;
  onRoleChange: (val: MemberRole) => void;
  onRemove: () => void;
};

export function MemberRoleCard({
  index, nickname, role, onNicknameChange, onRoleChange, onRemove,
}: Props) {
  return (
    <div className="border border-hairline rounded-md p-4 bg-surface-soft">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-semibold text-muted">팀원 {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-muted hover:text-primary"
        >
          삭제
        </button>
      </div>
      <input
        type="text"
        value={nickname}
        onChange={(e) => onNicknameChange(e.target.value)}
        placeholder="닉네임"
        maxLength={10}
        className="w-full border border-hairline rounded-sm px-3 h-10 text-sm text-ink mb-3 focus:outline-none focus:border-primary bg-white"
      />
      <div className="grid grid-cols-2 gap-2">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onRoleChange(r.value)}
            className={`
              flex items-center gap-1.5 px-3 py-2 rounded-sm border text-xs font-semibold transition-all
              ${role === r.value
                ? "bg-primary-soft border-primary text-primary"
                : "bg-white border-hairline text-muted hover:border-body"}
            `}
          >
            <span>{r.emoji}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
