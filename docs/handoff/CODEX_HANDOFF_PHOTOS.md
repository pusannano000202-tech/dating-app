# Codex 인수인계 문서 — 사진 업로드 실제 연동

> **작성자:** Claude (충현 세션 #3, 2026-05-15)
> **대상:** Codex — 사진 관련 실제 Supabase Storage 연동 담당
> **브랜치:** `profile/worldcup-ui` (현재 작업 브랜치)

---

## 현재 완성된 것

Claude가 사진 업로드 UI까지 구현해뒀어. Codex가 실제 Storage 연동만 완성하면 돼.

### 완성된 파일

| 파일 | 설명 |
|------|------|
| `components/profile/PhotoUpload.tsx` | 사진 선택 UI, 미리보기, 슬롯 3개 |
| `app/profile/photos/page.tsx` | 페이지 로직 — Supabase Storage 업로드 + AI 서버 호출 |

---

## Codex가 해야 할 것

### 1. Supabase Storage 버킷 생성

Supabase 대시보드에서:
- Storage → "New bucket"
- Bucket name: **`photos`**
- Public bucket: **ON** (AI 서버가 URL로 접근해야 하니까)
- File size limit: 10MB
- Allowed MIME types: `image/jpeg, image/png, image/webp`

### 2. Storage RLS 정책 추가

```sql
-- photos 버킷: 본인만 업로드/삭제 가능
CREATE POLICY "owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 누구나 읽기 가능 (AI 서버가 URL로 접근)
CREATE POLICY "public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');
```

### 3. `.env.local`에 AI 서버 URL 추가

```bash
NEXT_PUBLIC_AI_SERVER_URL=http://localhost:8001
```

실제 배포 시엔 AI 서버 주소로 변경. (Python 서버는 기본 8001 포트)

---

## 코드 흐름 설명

`app/profile/photos/page.tsx`의 `handleComplete` 함수가 이미 전체 흐름을 구현해뒀어:

```
1. supabase.storage.from('photos').upload(path, blob, { upsert: true })
   경로: {user_id}/photo_{0,1,2}.{ext}

2. supabase.storage.from('photos').getPublicUrl(path)
   → 공개 URL 획득

3. fetch(`${AI_SERVER_URL}/api/score-photos`, { method: 'POST', body: { user_id, photo_urls } })
   → fire-and-forget (실패해도 페이지 이동 계속)

4. router.push('/profile/survey')
```

`isConfigured` 체크로 Supabase URL이 placeholder이면 Storage 업로드 스킵하고 진행함.
실제 키 세팅하면 자동으로 Storage 업로드 경로 탄다.

---

## 테스트 방법

1. Supabase `.env.local`에 실제 키 세팅
2. Storage 버킷 `photos` 생성 완료
3. `npx next dev` 실행
4. 로그인 → /profile/photos 접근
5. 사진 선택 → 다음 클릭
6. Supabase Storage에 `{user_id}/photo_0.jpg` 파일 확인

---

## 주의사항

- Storage 경로에서 `{user_id}`는 `auth.uid()`와 동일해야 RLS 통과
- AI 서버(`python/appearance/main.py`)는 `POST /api/score-photos` 엔드포인트 이미 구현됨
- AI 서버 응답 기다리지 않음 (비동기 처리) — score가 없어도 프로필 완성 가능

---

## 연락 필요한 경우

- Supabase 버킷 설정 막히면 충현한테 연락
- AI 서버 연동 관련은 `python/appearance/README.md` 참고
