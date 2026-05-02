export const config = { runtime: 'edge' }

type Status = 'ok' | 'error' | 'missing_key' | 'not_configured'

async function checkSupabase(): Promise<Status> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!url) return 'missing_key'
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      // /auth/v1/health does not require apikey but accepts it; pass anon key if available
      headers: process.env.VITE_SUPABASE_ANON_KEY
        ? { apikey: process.env.VITE_SUPABASE_ANON_KEY }
        : {},
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkResend(): Promise<{ status: Status; detail?: string }> {
  // We deliberately don't hit Resend's API here. The only key we have in
  // production is sending-only, so any read endpoint (/domains, /emails,
  // /api-keys) returns 401 and shows up as a noisy error in Resend's logs.
  // Instead, validate that a key exists and looks well-formed. Actual send
  // failures still get logged from notify-* handlers.
  const key = process.env.RESEND_API_KEY
  if (!key) return { status: 'missing_key' }
  if (!key.startsWith('re_')) {
    return { status: 'error', detail: 'RESEND_API_KEY does not look like a Resend key (expected re_*)' }
  }
  return { status: 'ok', detail: 'key present (send path not probed to avoid log noise)' }
}

async function checkTelnyx(): Promise<Status> {
  const key = process.env.TELNYX_API_KEY
  const phone = process.env.TELNYX_PHONE_NUMBER
  if (!key && !phone) return 'not_configured'
  if (!key || !phone) return 'missing_key'
  try {
    // Lightweight auth check: list phone numbers (returns 401 if key bad).
    const res = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=1', {
      headers: { Authorization: `Bearer ${key}` },
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export default async function handler(request: Request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [supabase, resend, telnyx] = await Promise.all([
    checkSupabase(),
    checkResend(),
    checkTelnyx(),
  ])

  const body = {
    supabase,
    resend: resend.status,
    resend_detail: resend.detail,
    telnyx,
    timestamp: new Date().toISOString(),
  }

  // 200 if everything reachable; 503 if any required service is degraded
  const required: Status[] = [supabase, resend.status]
  const httpStatus = required.every(s => s === 'ok') ? 200 : 503

  return new Response(JSON.stringify(body, null, 2), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
