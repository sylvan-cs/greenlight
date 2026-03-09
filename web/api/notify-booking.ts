export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { roundId } = await request.json()
  if (!roundId) {
    return new Response(JSON.stringify({ error: 'Missing roundId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const resendKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseKey && 'SUPABASE_SERVICE_KEY',
      !resendKey && 'RESEND_API_KEY',
    ].filter(Boolean)
    return new Response(JSON.stringify({ error: 'Missing server configuration', missing }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch the round with courses and RSVPs
  const roundRes = await fetch(
    `${supabaseUrl}/rest/v1/rounds?id=eq.${roundId}&select=*,round_courses(*,courses(*)),rsvps(*)`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  )
  const rounds = await roundRes.json()
  const round = rounds?.[0]

  if (!round || round.status !== 'booked') {
    return new Response(JSON.stringify({ error: 'Round not found or not booked' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get course name
  const courseName = round.specific_course_id
    ? round.round_courses?.find((rc: any) => rc.course_id === round.specific_course_id)?.courses?.name
    : round.round_courses?.[0]?.courses?.name
  const courseDisplay = courseName ?? 'the course'

  // Format date
  const date = new Date(round.round_date + 'T12:00:00')
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Format tee time: "08:30" → "8:30 AM"
  const teeTime = round.specific_tee_time || round.time_window_start
  const [h, m] = teeTime.split(':').map(Number)
  const timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`

  // Get organizer name (first RSVP)
  const organizerName = round.rsvps?.[0]?.name ?? 'Your group organizer'

  // Collect emails from RSVPs who are "in" and provided an email
  const recipients: string[] = (round.rsvps ?? [])
    .filter((r: any) => r.status === 'in' && r.email)
    .map((r: any) => r.email)

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const subject = `You're on the tee — ${courseDisplay} on ${dateStr}`
  const body = `${organizerName} booked a tee time at ${courseDisplay} on ${dateStr} at ${timeStr}. See you out there.`

  let sent = 0
  for (const to of recipients) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'The Starter <teetimes@thestarter.golf>',
          to: [to],
          subject,
          text: body,
        }),
      })
      if (emailRes.ok) sent++
    } catch {
      // continue sending to remaining recipients
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
