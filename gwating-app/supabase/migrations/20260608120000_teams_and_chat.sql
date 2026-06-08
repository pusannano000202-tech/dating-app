-- 부팅(과팅앱) — 팀 + 실시간 채팅 스키마
-- 공용 마이그레이션: 추가/변경 시 충현(프로필 모듈)에게 알림 필요.
--
-- 범위: 프로토타입의 TeamProfile / 팀장 채팅을 Supabase로 이전.
-- 인증(Supabase Auth)은 아직 미도입 → anon 역할에 한정된 read/insert 만 허용.
-- (auth 도입 시 RLS 정책을 사용자 단위로 강화할 것)

-- =========================================================
-- teams : 한 팀(=그룹)의 요약. TeamProfile 과 1:1 대응
-- =========================================================
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  team_name     text not null,
  school        text not null default '부산대학교',
  region        text not null default '부산',
  size          int  not null check (size between 1 and 8),
  age_range     text not null,                       -- 예: "22~23"
  mood          text not null check (mood in (
                  'comfortableTalk','activeSocial','gamesAndDrinks',
                  'respectfulSafe','naturalIntro')),
  male_count    int,
  female_count  int,
  created_at    timestamptz not null default now()
);

-- =========================================================
-- team_members : 팀에 속한 구성원. TeamMember 와 대응
-- =========================================================
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  nickname    text not null,
  role        text not null check (role in (
                'moodMaker','coordinator','considerate','reactor')),
  traits      jsonb,                                 -- Record<TraitKey, number> | null
  is_leader   boolean not null default false,
  gender      text check (gender in ('male','female')),
  created_at  timestamptz not null default now()
);

create index if not exists team_members_team_id_idx on public.team_members(team_id);

-- =========================================================
-- chat_messages : 팀장 채널(두 팀 사이의 대화). match_id 로 묶인다
-- =========================================================
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    text not null,                         -- 대화 키 (matchFlow.matchId)
  sender      text not null,                         -- 보낸 사람 표시 이름(팀장 닉네임)
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_match_id_created_idx
  on public.chat_messages(match_id, created_at);

-- =========================================================
-- GRANTS : API 노출을 "열고 싶은 테이블만" 명시적으로 부여.
-- 프로젝트 설정 "Automatically expose new tables" 를 OFF 로 두는 전제.
-- (향후 충현의 appearance_scores 등 절대-비공개 테이블이 합류해도
--  명시 GRANT 가 없으면 API 에 노출되지 않음 = secure by default)
-- =========================================================
grant select on public.teams to anon, authenticated;
grant select on public.team_members to anon, authenticated;
grant select, insert on public.chat_messages to anon, authenticated;

-- =========================================================
-- Realtime : chat_messages 변경을 구독 가능하게
-- =========================================================
alter publication supabase_realtime add table public.chat_messages;

-- =========================================================
-- RLS : 인증 전 단계라 anon 에 한정 권한만 허용
-- =========================================================
alter table public.teams         enable row level security;
alter table public.team_members  enable row level security;
alter table public.chat_messages enable row level security;

-- 팀/팀원: 읽기만 공개 (관리자 대시보드 · 매칭 화면이 읽음)
create policy "teams readable by anon"
  on public.teams for select using (true);

create policy "team_members readable by anon"
  on public.team_members for select using (true);

-- 채팅: 읽기 + 보내기 허용, 수정/삭제는 불가
create policy "chat readable by anon"
  on public.chat_messages for select using (true);

create policy "chat insertable by anon"
  on public.chat_messages for insert with check (char_length(body) between 1 and 1000);
