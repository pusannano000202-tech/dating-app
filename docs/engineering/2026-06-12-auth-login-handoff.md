# Auth/Login Handoff - 2026-06-12

## Current Decision

Login is temporarily moved out of the critical path for local UI/design work.

The app now has a local-only preview bypass:

- `.env.local`: `NEXT_PUBLIC_DEV_AUTH_BYPASS=true`
- Login page button: `디자인 확인용으로 입장`
- Preview hub: `/dev/preview`
- Cookie used by middleware: `booting_dev_auth=1`

This is for local development only. It is disabled in production by `NODE_ENV !== 'production'`.

## Why This Exists

Supabase email auth is currently blocked by SMTP/template configuration:

- The app was changed to email OTP code entry.
- Supabase is still sending the default `Sign in` link email.
- The dashboard shows: `Set up custom SMTP to edit templates`.
- Without custom SMTP, the hosted Supabase project does not allow editing the Magic Link/OTP email body.

Because of that, the UI cannot reliably be tested through real login yet.

## Production Auth Work Still Needed

1. Set up a custom SMTP provider.
   Recommended quick path: Resend, SendGrid, Brevo, or another SMTP provider.

2. Configure Supabase SMTP:
   - `Authentication > SMTP Settings`
   - Sender email address
   - Sender name
   - Host
   - Port
   - Username
   - Password/API key

3. Update the Magic Link or OTP email template:

```html
<h2>부팅 로그인 인증번호</h2>
<p>아래 6자리 숫자를 앱에 입력해주세요.</p>
<h1>{{ .Token }}</h1>
```

4. Re-test:
   - Open `/login`
   - Enter email
   - Receive a 6 digit code
   - Enter code in the app
   - Confirm redirect to the requested page

5. Before production deploy:
   - Set `NEXT_PUBLIC_DEV_AUTH_BYPASS=false` or remove it.
   - Confirm Vercel environment variables do not enable the bypass.
   - Add production callback URLs in Supabase auth URL configuration.

## Useful References

- Supabase SMTP guide: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase email templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase passwordless email auth: https://supabase.com/docs/guides/auth/auth-email-passwordless

