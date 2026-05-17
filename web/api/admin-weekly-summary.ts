export const config = { runtime: 'edge' }

// Invoked by Vercel Cron every Sunday at 12:00 UTC (8am EDT / 7am EST).
// Builds a 7-day activity digest from Supabase and emails the admin via Resend.
//
// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. We validate that
// header when CRON_SECRET is set. The endpoint also supports manual invocation
// for ad-hoc summaries — just omit the env var (less secure) or supply the
// matching bearer.

export default async function handler(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'sylvan.juarez@gmail.com'
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const resendKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    return new Response(JSON.stringify({ error: 'Missing server configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const restHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  }

  // GET rows
  const sbGet = (path: string) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: restHeaders }).then(r => r.json())

  // Exact count via Content-Range header (HEAD avoids body transfer)
  const sbCount = async (path: string): Promise<number> => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { ...restHeaders, Prefer: 'count=exact', Range: '0-0' },
    })
    const cr = res.headers.get('content-range') || '0-0/0'
    const total = parseInt(cr.split('/').pop() || '0', 10)
    return Number.isFinite(total) ? total : 0
  }

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekAgoIso = weekAgo.toISOString()

  const [
    newUsers,
    newRounds,
    matchedRounds,
    bookedRounds,
    notifsSent,
    courseReqCount,
    profilesTotal,
    activeRounds,
    activeStandby,
  ] = await Promise.all([
    sbCount(`profiles?select=id&created_at=gte.${weekAgoIso}`),
    sbCount(`rounds?select=id&created_at=gte.${weekAgoIso}`),
    sbCount(`rounds?select=id&matched_at=gte.${weekAgoIso}`),
    sbCount(`rounds?select=id&status=eq.booked&updated_at=gte.${weekAgoIso}`),
    sbCount(`round_notifications?select=id&sent_at=gte.${weekAgoIso}`),
    sbCount(`course_requests?select=id&created_at=gte.${weekAgoIso}`),
    sbCount('profiles?select=id'),
    sbCount('rounds?select=id&status=in.(open,watching)'),
    sbCount('rounds?select=id&standby_mode=eq.true&status=in.(open,watching)'),
  ])

  // Recent course requests (detail)
  const recentReqs: Array<{ course_name: string; created_at: string }> = await sbGet(
    `course_requests?select=course_name,created_at&created_at=gte.${weekAgoIso}&order=created_at.desc&limit=10`
  ).catch(() => [])

  // Top courses by user demand (user_courses pick count)
  const userCourses: Array<{ courses: { name: string } | null }> = await sbGet(
    'user_courses?select=courses(name)'
  ).catch(() => [])
  const demand: Record<string, number> = {}
  for (const uc of userCourses) {
    const n = uc.courses?.name
    if (n) demand[n] = (demand[n] || 0) + 1
  }
  const topCourses = Object.entries(demand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Currently-disabled courses (operational health flag)
  const disabledCourses: Array<{ name: string; booking_system: string }> = await sbGet(
    'courses?select=name,booking_system&scan_enabled=eq.false'
  ).catch(() => [])

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
  const dateRange = `${fmtDate(weekAgo)} → ${fmtDate(now)}`

  const lines: string[] = [
    `THE STARTER — WEEKLY ADMIN SUMMARY`,
    `${dateRange}`,
    '',
    `ACTIVITY (last 7 days)`,
    `  New users:           ${newUsers}`,
    `  Rounds created:      ${newRounds}`,
    `  Rounds matched:      ${matchedRounds}`,
    `  Rounds booked:       ${bookedRounds}`,
    `  Notifications sent:  ${notifsSent}`,
    `  Course requests:     ${courseReqCount}`,
    '',
    `CURRENT STATE`,
    `  Total profiles:      ${profilesTotal}`,
    `  Active rounds:       ${activeRounds}`,
    `  Active standby:      ${activeStandby}`,
    '',
  ]

  if (topCourses.length) {
    lines.push('TOP 5 COURSES BY USER DEMAND')
    for (const [name, count] of topCourses) {
      lines.push(`  ${String(count).padStart(3)} × ${name}`)
    }
    lines.push('')
  }

  if (recentReqs.length) {
    lines.push('NEW COURSE REQUESTS (last 7 days)')
    for (const r of recentReqs) {
      lines.push(`  ${r.created_at.slice(0, 10)}  ${r.course_name}`)
    }
    lines.push('')
  }

  if (disabledCourses.length) {
    lines.push('DISABLED COURSES (scan_enabled = false)')
    for (const c of disabledCourses) {
      lines.push(`  ${c.name} (${c.booking_system})`)
    }
    lines.push('')
  }

  lines.push('— The Starter (weekly admin)')

  const body = lines.join('\n')
  const subject =
    `Weekly: ${newUsers} new user${newUsers === 1 ? '' : 's'}, ` +
    `${newRounds} round${newRounds === 1 ? '' : 's'}, ` +
    `${matchedRounds} match${matchedRounds === 1 ? '' : 'es'}`

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

  return new Response(
    JSON.stringify({
      ok: true,
      stats: { newUsers, newRounds, matchedRounds, bookedRounds, notifsSent, courseReqCount },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
