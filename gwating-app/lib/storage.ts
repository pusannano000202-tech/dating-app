import { UserProfile, TeamProfile } from "@/types/matching";
import { MatchFlowState } from "@/types/match-flow";

const KEYS = {
  user: "gwating_user",
  team: "gwating_team",
  matchFlow: "matchFlow",
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

export function saveMatchFlow(state: MatchFlowState): void {
  localStorage.setItem(KEYS.matchFlow, JSON.stringify(state));
}

export function loadMatchFlow(): MatchFlowState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(KEYS.matchFlow);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MatchFlowState;
  } catch {
    return null;
  }
}

export function clearMatchFlow(): void {
  localStorage.removeItem(KEYS.matchFlow);
}

export function clearAll(): void {
  localStorage.removeItem(KEYS.user);
  localStorage.removeItem(KEYS.team);
  localStorage.removeItem(KEYS.matchFlow);
}
