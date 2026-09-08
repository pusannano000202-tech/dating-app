begin;
-- Extend the installed check expression without losing kinds introduced by earlier migrations.
do $$declare rule text;begin
 select pg_get_expr(conbin,conrelid) into rule from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_kind_check';
 if rule is null then raise exception 'notification_kind_contract_missing';end if;
 alter table public.notifications drop constraint notifications_kind_check;
 execute format('alter table public.notifications add constraint notifications_kind_check check ((%s) or kind = %L)',rule,'community_voice');
end;$$;
create unique index notifications_community_voice_event on public.notifications(user_id,(payload->>'roomId'),(payload->>'revision')) where kind='community_voice';
commit;
