# Tonight 최초 최고관리자 지정

G1 운영 안내를 통합 작업공간으로 이관했다. 공개 회원가입은 일반 사용자로 끝나며, 최고관리자 선택이나 공개 승격 API는 없다. 이 문서는 실행 승인이 아니다.

## 별도 승인 후 한 번만 실행

1. 서비스 소유자가 일반 가입 및 기본 프로필을 완료한다. 현재 통합 가입은 전화번호 인증을 사용한다.
2. Supabase Authentication에서 정확한 계정 UUID를 확인한다.
3. 승인된 환경의 **SQL Editor**에서 대상 UUID를 확인한 후 실행한다.

```sql
select quantum_private.bootstrap_initial_super_admin(
  '00000000-0000-0000-0000-000000000000'::uuid
);
```

4. 결과 revision 1을 확인하고 재로그인한다. `/auth/continue`가 실제 권한을 읽어 `/admin/super-admin/tonight`로 연결한다.

## 안전 조건

- 대상은 이미 일반 가입을 마친 `public.users` 계정이어야 한다.
- 함수는 데이터베이스 관리자 또는 서비스 권한으로만 실행한다. 비밀 키를 브라우저나 문서에 입력하지 않는다.
- 최고관리자가 이미 존재하면 두 번째 bootstrap은 `super_admin_already_bootstrapped`로 거부된다.
- 이후 권한 변경은 최근 재인증한 최고관리자가 기존 revision/idempotency 관리 RPC로 수행한다.
- 실패하면 재시도 전에 최고관리자 존재 여부를 읽기 전용으로 확인한다.

해당 migration을 적용하지 않은 환경에는 함수가 없다. 소스 존재는 원격 적용 증거가 아니다. 이번 통합 작업은 bootstrap·원격 migration을 실행하지 않았다.
