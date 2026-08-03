import { supabase } from './supabase'

/**
 * POST to one of our /api/* endpoints with the caller's Supabase session
 * attached.
 *
 * Those endpoints hold the service-role key and can email/SMS users, so they
 * now require a valid session JWT and verify round/group membership. Any
 * client call that omits the token gets a 401.
 */
export async function apiPost(path: string, body: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}
