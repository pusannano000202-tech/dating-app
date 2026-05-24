import { saveUser, loadUser, saveTeam, loadTeam, clearAll } from "@/lib/storage";
import { UserProfile, TeamProfile } from "@/types/matching";

const mockUser: UserProfile = {
  nickname: "테스터",
  traits: {
    atmosphereCoordination: 4,
    consideration: 3,
    participation: 5,
    respectfulness: 4,
    communicationBalance: 3,
  },
};

const mockTeam: TeamProfile = {
  teamName: "테스트팀",
  school: "부산대학교",
  region: "부산",
  size: 3,
  ageRange: "22~23",
  mood: "naturalIntro",
  members: [{ nickname: "테스터", role: "coordinator", isLeader: true }],
};

describe("storage", () => {
  beforeEach(() => {
    // Node 환경에서 localStorage mock
    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      length: 0,
      key: () => null,
    };
  });

  it("saves and loads user", () => {
    saveUser(mockUser);
    expect(loadUser()).toEqual(mockUser);
  });

  it("returns null when no user saved", () => {
    expect(loadUser()).toBeNull();
  });

  it("saves and loads team", () => {
    saveTeam(mockTeam);
    expect(loadTeam()).toEqual(mockTeam);
  });

  it("returns null when no team saved", () => {
    expect(loadTeam()).toBeNull();
  });

  it("clearAll removes both keys", () => {
    saveUser(mockUser);
    saveTeam(mockTeam);
    clearAll();
    expect(loadUser()).toBeNull();
    expect(loadTeam()).toBeNull();
  });
});
