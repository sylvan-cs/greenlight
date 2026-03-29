export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { groupId, newUserId } = await request.json()
  if (!groupId || !newUserId) {
    return new Response(JSON.stringify({ error: 'Missing groupId or newUserId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const resendKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    return new Response(JSON.stringify({ error: 'Missing server configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  }

  // Fetch the group
  const groupRes = await fetch(
    `${supabaseUrl}/rest/v1/groups?id=eq.${groupId}&select=*`,
    { headers }
  )
  const groups = await groupRes.json()
  const group = groups?.[0]
  if (!group) {
    return new Response(JSON.stringify({ error: 'Group not found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch new member's name
  const newMemberRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${newUserId}&select=full_name,email`,
    { headers }
  )
  const newMembers = await newMemberRes.json()
  const newMember = newMembers?.[0]
  const newMemberName = newMember?.full_name ?? 'Someone'

  // Fetch group owner's email
  const ownerRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${group.created_by}&select=full_name,email`,
    { headers }
  )
  const owners = await ownerRes.json()
  const owner = owners?.[0]

  if (!owner?.email) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const subject = `${newMemberName} joined ${group.name}`
  const body = [
    `${newMemberName} joined your group ${group.name} on The Starter.`,
    '',
    '\u2014 The Starter',
  ].join('\n')

  let sent = 0
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'The Starter <teetimes@thestarter.golf>',
        to: [owner.email],
        subject,
        text: body,
      }),
    })
    if (emailRes.ok) sent++
  } catch {
    // continue
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
