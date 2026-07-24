-- 충현 담당: photos 테이블 생성
-- 사용자가 업로드한 사진 메타데이터 저장
-- Storage 버킷: 'photos' (별도 설정 필요)

CREATE TABLE IF NOT EXISTS photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,             -- photos/{user_id}/photo_{idx}.{ext}
  public_url   TEXT NOT NULL,
  sort_order   SMALLINT NOT NULL DEFAULT 0, -- 0 = 대표사진
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photos_user_id_idx ON photos(user_id);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- 본인 사진만 읽기/쓰기
CREATE POLICY "owner_rw" ON photos
  FOR ALL USING (auth.uid() = user_id);

-- service_role (AI 서버)은 전체 읽기 허용
CREATE POLICY "service_role_read" ON photos
  FOR SELECT USING (auth.role() = 'service_role');

-- Storage 버킷 RLS (Supabase 대시보드에서 추가 필요)
-- 아래 SQL은 참고용 — Storage 정책은 storage.objects 테이블에 별도 설정
/*
CREATE POLICY "owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');
*/
