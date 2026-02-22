export function formatTime(time: string): string {
  const [h, m] = time.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${m} ${ampm}`
}

export function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function generateShareCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/** Map time_window_start/end back to a label like "Morning" */
export function getTimeWindowLabel(start: string, end: string): string {
  if (start === '06:00' && end === '10:00') return 'Morning'
  if (start === '10:00' && end === '14:00') return 'Midday'
  if (start === '14:00' && end === '18:00') return 'Afternoon'
  return `${formatTime(start)} – ${formatTime(end)}`
}

/** Generate the next 14 day chips for date picker */
export function generateDateChips(): { date: string; dayLabel: string; dateNum: number; monthLabel: string }[] {
  const chips = []
  const now = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    let dayLabel: string
    if (i === 0) dayLabel = 'TODAY'
    else if (i === 1) dayLabel = 'TMRW'
    else dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    chips.push({
      date: dateStr,
      dayLabel,
      dateNum: d.getDate(),
      monthLabel: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    })
  }
  return chips
}
