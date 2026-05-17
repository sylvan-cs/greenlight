export const config = { runtime: 'edge' }

// Receives event POSTs from Postgres triggers (via pg_net) and emails the
// admin via Resend. Two event types:
//   - new_user        — fired AFTER INSERT on profiles
//   - course_request  — fired AFTER INSERT on course_requests
//
// Auth: the calling trigger sets the x-admin-secret header to the value of
// the app.admin_notify_secret Postgres setting. We compare against the
// ADMIN_NOTIFY_SECRET env var. Both must match exactly.

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const secret = request.headers.get('x-admin-secret') ?? ''
  const expected = process.env.ADMIN_NOTIFY_SECRET ?? ''
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'sylvan.juarez@gmail.com'
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let event: string
  let data: any
  try {
    const body = await request.json()
    event = body.event
    data = body.data ?? {}
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let subject = ''
  let body = ''

  if (event === 'new_user') {
    const name = data.full_name || '(name not provided yet)'
    subject = `New signup: ${data.full_name || data.email || 'unnamed'}`
    body = [
      'A new user just signed up for The Starter.',
      '',
      `Name:        ${name}`,
      `Email:       ${data.email || '(no email)'}`,
      `User ID:     ${data.user_id}`,
      `Signed up:   ${data.created_at}`,
      '',
      '— The Starter (admin notifier)',
    ].join('\n')
  } else if (event === 'course_request') {
    subject = `Course request: ${data.course_name}`
    body = [
      "A user requested a course that isn't on The Starter yet.",
      '',
      `Course:       ${data.course_name}`,
      `Requested by: ${data.user_name || '(no name)'} <${data.user_email || 'no email on file'}>`,
      `User ID:      ${data.user_id}`,
      `Requested at: ${data.created_at}`,
      '',
      '— The Starter (admin notifier)',
    ].join('\n')
  } else {
    return new Response(JSON.stringify({ error: `Unknown event: ${event}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'The Starter <teetimes@thestarter.golf>',
      to: [adminEmail],
      subject,
      text: body,
    }),
  })

  if (!emailRes.ok) {
    const errText = await emailRes.text().catch(() => '')
    return new Response(
      JSON.stringify({ error: 'Resend failed', status: emailRes.status, details: errText }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(JSON.stringify({ ok: true, event }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
