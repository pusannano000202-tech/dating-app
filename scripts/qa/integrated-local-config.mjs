export const INTEGRATED_STACK = Object.freeze({
  projectId: 'quantum-integrated-campus-20260905',
  runtimeDirectory: '.tmp/integrated-live-local',
  apiUrl: 'http://127.0.0.1:56421',
  appOrigin: 'http://localhost:3010',
})

// Local Auth test codes only; no live provider credentials or role grants.
// CLI 2.116.0 disables phone Auth unless a provider is enabled. These unusable
// Twilio placeholders enable the local protocol only. GoTrue skips delivery for
// test_otp; the live-local app rejects all numbers outside the four-number list.
// This file must never be used to configure a hosted Auth service.
export function integratedLocalConfig() {
  return `project_id = "${INTEGRATED_STACK.projectId}"
[api]
enabled = true
port = 56421
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 56422
shadow_port = 56420
major_version = 17
[db.migrations]
enabled = true
[db.seed]
enabled = false
sql_paths = []
[studio]
enabled = true
port = 56423
api_url = "${INTEGRATED_STACK.apiUrl}"
[local_smtp]
enabled = true
port = 56424
[auth]
enabled = true
site_url = "${INTEGRATED_STACK.appOrigin}"
additional_redirect_urls = ["${INTEGRATED_STACK.appOrigin}/auth/callback"]
enable_signup = true
enable_anonymous_sign_ins = false
[auth.email]
enable_signup = true
enable_confirmations = true
otp_length = 6
otp_expiry = 300
[auth.sms]
enable_signup = true
enable_confirmations = true
template = "Local test code: {{ .Code }}"
max_frequency = "60s"
[auth.sms.test_otp]
821000000001 = "100001"
821000000002 = "100002"
821000000003 = "100003"
821000000004 = "100004"
[auth.sms.twilio]
enabled = true
account_sid = "AC00000000000000000000000000000000"
message_service_sid = "MG00000000000000000000000000000000"
auth_token = "local-test-only-not-a-provider-token"
`
}
