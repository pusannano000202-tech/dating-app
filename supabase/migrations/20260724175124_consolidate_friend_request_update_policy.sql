-- The guard_friend_requests_update trigger still enforces role-specific state
-- transitions. A single permissive policy preserves the prior OR semantics
-- without evaluating two UPDATE policies for every request.

DROP POLICY IF EXISTS "friend_requests_sender_cancel_update"
  ON public.friend_requests;
DROP POLICY IF EXISTS "friend_requests_receiver_respond_update"
  ON public.friend_requests;

CREATE POLICY "friend_requests_participant_update"
  ON public.friend_requests
  FOR UPDATE
  TO authenticated
  USING (
    sender_user_id = (SELECT auth.uid())
    OR receiver_user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    sender_user_id = (SELECT auth.uid())
    OR receiver_user_id = (SELECT auth.uid())
  );
