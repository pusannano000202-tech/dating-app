import { UserProfile, TeamProfile } from "@/types/matching";

const KEYS = {
  user: "gwating_user",
  team: "gwating_team",
} as const;

export function saveUser(profile: UserProfile): void {
  localStorage.setItem(KEYS.user, JSON.stringify(profile));
}

export function loadUser(): UserProfile | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(KEYS.user);
  return raw ? (JSON.parse(raw) as UserProfile) : null;
}

export function saveTeam(team: TeamProfile): void {
  localStorage.setItem(KEYS.team, JSON.stringify(team));
}

export function loadTeam(): TeamProfile | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(KEYS.team);
  return raw ? (JSON.parse(raw) as TeamProfile) : null;
}

export function clearAll(): void {
  localStorage.removeItem(KEYS.user);
  localStorage.removeItem(KEYS.team);
}
