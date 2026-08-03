-- Close the anonymous read exposure on rounds / rsvps / groups.
--
-- CURRENT STATE (verified 2026-07-29 with the publishable key alone, no login):
--   GET /rest/v1/rsvps?select=id,name,email   -> every RSVP, including emails
--   GET /rest/v1/rounds?select=id,share_code  -> every round + its share code
--   GET /rest/v1/groups?select=invite_code    -> every group invite code
-- profiles and course_requests are already correctly locked (return []).
-- Writes are already blocked; this is a read exposure.
--
-- WHY RLS ALONE CANNOT FIX THIS: the public share page looks a round up BY
-- share_code, and the invite page looks a group up BY invite_code. Those codes
-- are bearer tokens held by the client — RLS policies cannot condition on
-- "the caller filtered by the right code", so any policy permissive enough to
-- serve the share page is also permissive enough to list every row. The
-- standard fix is a SECURITY DEFINER function that takes the code as an
-- argument and returns only the matching row.
--
-- ============================ ORDERING — READ THIS ==========================
-- Applying Part 2 before the matching frontend is deployed WILL break the
-- public share and join pages.
--
--   1. Deploy the frontend that calls these RPCs (cd web && vercel --prod)
--   2. Verify /r/<share_code> and /join/<invite_code> still work logged OUT
--   3. THEN apply Part 2 below
--
-- Part 1 is safe to apply on its own at any time.
-- ===========================================================================


-- ─────────────────────────── PART 1 (safe now) ─────────────────────────────
-- RPCs that serve the public pages without exposing the tables themselves.
-- SECURITY DEFINER runs as the owner, bypassing RLS, so the function is the
-- only door in — and it returns exactly one row, selected by the secret code.
-- Note the deliberate omission of rsvps.email: the share page never displays
-- it, so it should never leave the database.

CREATE OR REPLACE FUNCTION public.get_shared_round(p_share_code text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT to_jsonb(r) - 'creator_id' || jsonb_build_object(
    'round_courses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'course_id', rc.course_id,
        'courses', to_jsonb(c)
      ))
      FROM round_courses rc
      JOIN courses c ON c.id = rc.course_id
      WHERE rc.round_id = r.id
    ), '[]'::jsonb),
    'rsvps', COALESCE((
      -- name/status only. No email, ever.
      SELECT jsonb_agg(jsonb_build_object(
        'id', rs.id,
        'round_id', rs.round_id,
        'user_id', rs.user_id,
        'name', rs.name,
        'status', rs.status,
        'is_watching', rs.is_watching,
        'created_at', rs.created_at
      ) ORDER BY rs.created_at)
      FROM rsvps rs
      WHERE rs.round_id = r.id
    ), '[]'::jsonb)
  )
  FROM rounds r
  WHERE r.share_code = p_share_code
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_group_by_invite(p_invite_code text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'created_by', g.created_by,
    'member_count', (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id)
  )
  FROM groups g
  WHERE g.invite_code = p_invite_code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_round(text) FROM public;
REVOKE ALL ON FUNCTION public.get_group_by_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_shared_round(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_by_invite(text) TO anon, authenticated;


-- ──────────────── PART 2 (ONLY after the frontend is deployed) ─────────────
-- Uncomment and run once /r/<code> and /join/<code> are confirmed working
-- against the RPCs above while logged out.
--
-- Two things to know before you run it:
--   * Supabase Realtime enforces ROW-level policies but does not filter
--     columns. SharePage subscribes to rsvps INSERT/UPDATE, so after this
--     runs an anonymous visitor's realtime subscription will stop delivering
--     rsvps events (the row policy no longer permits anon). The page falls
--     back to its normal fetch; confirm the live "who's in" list still updates
--     acceptably, or move that subscription behind an authenticated session.
--   * Anonymous RSVP writes are a separate surface and are NOT addressed here
--     — SharePage still inserts/updates rsvps and bumps rounds.spots_needed as
--     anon. Those belong behind an endpoint (same pattern as notify-*).
--
-- DROP POLICY IF EXISTS "rounds_anon_read"  ON rounds;
-- DROP POLICY IF EXISTS "rsvps_anon_read"   ON rsvps;
-- DROP POLICY IF EXISTS "groups_anon_read"  ON groups;
--
-- -- Replace whatever permissive SELECT policies exist with authenticated-only
-- -- access. Inspect first:
-- --   SELECT tablename, policyname, roles, cmd, qual
-- --   FROM pg_policies
-- --   WHERE tablename IN ('rounds','rsvps','groups','round_courses');
--
-- CREATE POLICY "rounds_member_read" ON rounds FOR SELECT TO authenticated
--   USING (
--     creator_id = auth.uid()
--     OR EXISTS (SELECT 1 FROM rsvps rs WHERE rs.round_id = rounds.id AND rs.user_id = auth.uid())
--   );
--
-- CREATE POLICY "rsvps_member_read" ON rsvps FOR SELECT TO authenticated
--   USING (
--     user_id = auth.uid()
--     OR EXISTS (SELECT 1 FROM rounds r WHERE r.id = rsvps.round_id AND r.creator_id = auth.uid())
--   );
--
-- CREATE POLICY "groups_member_read" ON groups FOR SELECT TO authenticated
--   USING (
--     created_by = auth.uid()
--     OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = groups.id AND gm.user_id = auth.uid())
--   );


-- ──────────────────────────── VERIFY AFTER PART 2 ──────────────────────────
-- With the publishable (anon) key only, these must all return zero rows:
--   curl -H "apikey: <ANON>" ".../rest/v1/rsvps?select=id,email&limit=5"
--   curl -H "apikey: <ANON>" ".../rest/v1/rounds?select=id,share_code&limit=5"
--   curl -H "apikey: <ANON>" ".../rest/v1/groups?select=id,invite_code&limit=5"
-- And this must still return the round:
--   curl -H "apikey: <ANON>" -H "Content-Type: application/json" \
--        -d '{"p_share_code":"<a real code>"}' \
--        ".../rest/v1/rpc/get_shared_round"
