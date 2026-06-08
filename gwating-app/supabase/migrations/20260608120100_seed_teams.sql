-- 시드: 기존 data/mockTeams.ts 의 5개 팀을 DB로 이전.
-- 재실행 안전성을 위해 같은 이름의 기존 시드 팀을 먼저 제거(members 는 cascade).

-- 구/신 이름 모두 정리(이미 옛 이름으로 시드했어도 깨끗하게 재실행 가능)
delete from public.teams where team_name in (
  '용두산 삼총사','남포동 클럽','해운대 게임단','온천장 신사단','서면 인트로',
  '국문과 이야기꾼들','경영학과 인싸들','물리과 악동들','법학과 모범생들','디자인과 낭만파'
);

-- 1) 국문과 이야기꾼들
with t as (
  insert into public.teams (team_name, size, age_range, mood)
  values ('국문과 이야기꾼들', 3, '22~23', 'comfortableTalk') returning id
)
insert into public.team_members (team_id, nickname, role, is_leader, traits)
select t.id, m.nickname, m.role, m.is_leader, m.traits from t, (values
  ('민준','coordinator', true,
    '{"atmosphereCoordination":4,"consideration":4,"participation":3,"respectfulness":5,"communicationBalance":5}'::jsonb),
  ('서연','coordinator', false, null),
  ('지호','considerate', false, null)
) as m(nickname, role, is_leader, traits);

-- 2) 경영학과 인싸들
with t as (
  insert into public.teams (team_name, size, age_range, mood)
  values ('경영학과 인싸들', 4, '21~24', 'activeSocial') returning id
)
insert into public.team_members (team_id, nickname, role, is_leader, traits)
select t.id, m.nickname, m.role, m.is_leader, m.traits from t, (values
  ('현우','moodMaker', true,
    '{"atmosphereCoordination":5,"consideration":3,"participation":5,"respectfulness":3,"communicationBalance":4}'::jsonb),
  ('은지','moodMaker', false, null),
  ('태양','reactor', false, null),
  ('소희','reactor', false, null)
) as m(nickname, role, is_leader, traits);

-- 3) 물리과 악동들
with t as (
  insert into public.teams (team_name, size, age_range, mood)
  values ('물리과 악동들', 3, '22~24', 'gamesAndDrinks') returning id
)
insert into public.team_members (team_id, nickname, role, is_leader, traits)
select t.id, m.nickname, m.role, m.is_leader, m.traits from t, (values
  ('준혁','moodMaker', true,
    '{"atmosphereCoordination":5,"consideration":2,"participation":5,"respectfulness":3,"communicationBalance":3}'::jsonb),
  ('다은','reactor', false, null),
  ('성민','reactor', false, null)
) as m(nickname, role, is_leader, traits);

-- 4) 법학과 모범생들
with t as (
  insert into public.teams (team_name, size, age_range, mood)
  values ('법학과 모범생들', 3, '21~22', 'respectfulSafe') returning id
)
insert into public.team_members (team_id, nickname, role, is_leader, traits)
select t.id, m.nickname, m.role, m.is_leader, m.traits from t, (values
  ('도윤','considerate', true,
    '{"atmosphereCoordination":3,"consideration":5,"participation":3,"respectfulness":5,"communicationBalance":4}'::jsonb),
  ('나연','considerate', false, null),
  ('재원','coordinator', false, null)
) as m(nickname, role, is_leader, traits);

-- 5) 디자인과 낭만파
with t as (
  insert into public.teams (team_name, size, age_range, mood)
  values ('디자인과 낭만파', 4, '20~23', 'naturalIntro') returning id
)
insert into public.team_members (team_id, nickname, role, is_leader, traits)
select t.id, m.nickname, m.role, m.is_leader, m.traits from t, (values
  ('수아','coordinator', true,
    '{"atmosphereCoordination":4,"consideration":4,"participation":4,"respectfulness":4,"communicationBalance":4}'::jsonb),
  ('찬호','moodMaker', false, null),
  ('예린','considerate', false, null),
  ('민서','reactor', false, null)
) as m(nickname, role, is_leader, traits);
