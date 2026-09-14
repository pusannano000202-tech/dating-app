// Catalog-only local startup guard. A file snapshot is not proof that SQL ran.
const checks = ['league_notices', 'admission_checkout', 'chat_sender_identity', 'native_polls', 'room_presentation', 'cancellation_liability', 'erasure_guard', 'admission_refunds', 'payment_reconciliation']

export const SOCIAL_SCENES_SCHEMA_PROBE_SQL = `BEGIN READ ONLY;
SELECT jsonb_build_object(
 'league_notices', to_regclass('quantum_private.league_admission_room_notices') IS NOT NULL,
 'admission_checkout', to_regclass('quantum_private.meetup_admission_checkout_orders') IS NOT NULL,
 'chat_sender_identity', COALESCE(position('''is_me''' in pg_get_functiondef(to_regprocedure('public.get_my_activity_meetup_chat(uuid)')))>0,false),
 'native_polls', to_regprocedure('quantum_private.chat_poll_current_members_before_native(text,uuid)') IS NOT NULL,
 'room_presentation', COALESCE(position('''activity_key''' in pg_get_functiondef(to_regprocedure('quantum_private.social_chat_room(text,uuid,uuid)')))>0,false),
 'cancellation_liability', COALESCE(position('''accepted''' in pg_get_functiondef(to_regprocedure('quantum_private.admission_room_closed()')))>0,false),
 'erasure_guard', to_regprocedure('quantum_private.account_has_unresolved_meetup_payments(uuid)') IS NOT NULL,
 'admission_refunds', to_regprocedure('public.list_my_meetup_admission_refunds()') IS NOT NULL
   AND to_regprocedure('public.request_my_meetup_admission_refund(uuid)') IS NOT NULL,
 'payment_reconciliation', to_regprocedure('public.reconcile_toss_deposit_cancellation(uuid,uuid,uuid,uuid,jsonb)') IS NOT NULL
);
ROLLBACK;`

export function assertSocialScenesSchemaReady(output) {
  let result
  try { result = JSON.parse(output) } catch { throw new Error('social_scenes_schema_probe_invalid') }
  if (!result || Array.isArray(result) || Object.keys(result).length !== checks.length || checks.some(name => typeof result[name] !== 'boolean')) {
    throw new Error('social_scenes_schema_probe_invalid')
  }
  const missing = checks.filter(name => !result[name])
  if (missing.length) throw new Error(`social_scenes_schema_missing:${missing.join(',')}`)
  return { ready: true, checked: [...checks] }
}
