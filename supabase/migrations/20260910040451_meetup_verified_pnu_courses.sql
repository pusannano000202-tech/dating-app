-- Data-only, forward-only catalog extension; no changes to identity, RLS, RPC or pools.
-- Verified 2026 PNU curriculum selections, retrieved 2026-09-10. Not live offerings.
-- Existing canonical rows are never overwritten. See docs/research/university-departments/PNU-STUDY-COVERAGE-20260910.md.
begin;

with sources(source_id, source_url) as (
  values ('cse', 'https://cse.pusan.ac.kr/bbs/cse/2605/978154/download.do'),
         ('biz', 'https://his.pusan.ac.kr/bbs/biz/2557/977269/download.do')
), courses(course_id, course_name, source_id) as (
  values
    ('pnu:CB1501014', 'C++프로그래밍과실습', 'cse'),
    ('pnu:CB1501015', '공학선형대수학', 'cse'),
    ('pnu:CB1501016', '논리회로및설계', 'cse'),
    ('pnu:CB1501017', '데이터과학입문', 'cse'),
    ('pnu:CB1501018', '논리회로설계및실험', 'cse'),
    ('pnu:CB1501019', '자료구조', 'cse'),
    ('pnu:CB1501022', '컴퓨터구조', 'cse'),
    ('pnu:CA1501006', '이산수학', 'cse'),
    ('pnu:CA1501028', '컴퓨터및프로그래밍입문', 'cse'),
    ('pnu:CA2001141', '인터넷과웹기초', 'cse'),
    ('pnu:CA1501029', '확률통계', 'cse'),
    ('pnu:CA1501030', '프로그래밍원리와실습', 'cse'),
    ('pnu:CA2001142', '공학선형대수학', 'cse'),
    ('pnu:CA2001144', 'C++프로그래밍과실습', 'cse'),
    ('pnu:CA2001145', '데이터과학입문', 'cse'),
    ('pnu:CA2001146', '인공지능수학', 'cse'),
    ('pnu:CA2001147', '자료구조', 'cse'),
    ('pnu:CA2001627', '인공지능개론', 'cse'),
    ('pnu:CA2001143', 'AI프로그래밍', 'cse'),
    ('pnu:DB1600346', '경영학원론', 'biz'),
    ('pnu:DB1600357', '경제학원론', 'biz'),
    ('pnu:DB1600351', '경영통계학', 'biz'),
    ('pnu:DB1600358', '회계학원리', 'biz'),
    ('pnu:DB3000711', '재무회계(Ⅰ)', 'biz'),
    ('pnu:DB3000928', '마케팅관리', 'biz'),
    ('pnu:DB3400701', '오퍼레이션스 매니지먼트', 'biz'),
    ('pnu:DB3000932', '재무관리', 'biz'),
    ('pnu:DB3000933', '인적자원관리', 'biz'),
    ('pnu:DB3000924', '투자론', 'biz'),
    ('pnu:DB3100231', '경영정보시스템', 'biz'),
    ('pnu:DB3000927', '관리회계', 'biz'),
    ('pnu:DB3000934', '국제경영학', 'biz')
)
insert into quantum_private.study_course_catalog (course_id, course_name, source_url)
select courses.course_id, courses.course_name, sources.source_url
from courses join sources using (source_id)
on conflict (course_id) do nothing;

commit;
