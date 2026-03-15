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

  // Twilio env vars (optional — SMS skipped if not configured)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER
  const twilioConfigured = !!(twilioSid && twilioToken && twilioPhone)

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

  // Get course info
  const courseRecord = round.specific_course_id
    ? round.round_courses?.find((rc: any) => rc.course_id === round.specific_course_id)?.courses
    : round.round_courses?.[0]?.courses
  const courseName = courseRecord?.name
  const courseDisplay = courseName ?? 'the course'
  const bookingUrl = courseRecord?.booking_url ?? ''

  // Format date (long form: "Sunday, March 22")
  const date = new Date(round.round_date + 'T12:00:00')
  const dateLong = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  // Short date for subject line
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  // Short date for booking link label (e.g. "Mar 22")
  const dateShort = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  // Format tee time: "08:30" → "8:30 AM"
  const teeTime = round.specific_tee_time || round.time_window_start
  const [h, m] = teeTime.split(':').map(Number)
  const timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`

  // Player count
  const playerCount = round.spots_needed ?? 0

  // Get organizer first name
  const organizerFullName = round.rsvps?.[0]?.name ?? 'Your group organizer'
  const organizerFirstName = organizerFullName.split(' ')[0]

  // Collect emails from RSVPs who are "in" and provided an email
  const recipients: string[] = (round.rsvps ?? [])
    .filter((r: any) => r.status === 'in' && r.email)
    .map((r: any) => r.email)

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, sms: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const subject = `You're on the tee — ${courseDisplay} on ${dateStr}`

  const bodyLines = [
    `${organizerFirstName} locked in a tee time.`,
    '',
    courseDisplay,
    `${dateLong} at ${timeStr}`,
    `${playerCount} players`,
  ]

  if (bookingUrl) {
    bodyLines.push('', bookingUrl)
    bodyLines.push(`→ Select ${dateShort} · ${playerCount} players · ${timeStr}`)
  }

  bodyLines.push('', 'See you out there.', '— The Starter')

  const body = bodyLines.join('\n')

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

  // Send SMS via Twilio to RSVPs who are "in" and have opted in
  let smsSent = 0
  if (twilioConfigured) {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`
    const twilioAuth = btoa(`${twilioSid}:${twilioToken}`)
    const smsBody = `✅ Locked in: ${timeStr} at ${courseDisplay} on ${dateLong}. See you out there.\n- The Starter`

    const inRsvps = (round.rsvps ?? []).filter((r: any) => r.status === 'in' && r.user_id)

    for (const rsvp of inRsvps) {
      try {
        // Fetch user profile to check sms_opt_in and phone
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${rsvp.user_id}&select=phone,sms_opt_in`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          }
        )
        const profiles = await profileRes.json()
        const profile = profiles?.[0]

        if (profile?.sms_opt_in && profile?.phone) {
          await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${twilioAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: twilioPhone!,
              To: profile.phone,
              Body: smsBody,
            }),
          })
          smsSent++
        }
      } catch {
        // continue sending to remaining recipients
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, sms: smsSent }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
