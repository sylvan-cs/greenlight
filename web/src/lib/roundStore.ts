export type TimeWindow = 'morning' | 'midday' | 'afternoon'

export interface RoundDraft {
  date: string
  timeWindow: TimeWindow
  timeStart: string
  timeEnd: string
  courseIds: string[]
  spots: number
}

export const TIME_WINDOWS: Record<TimeWindow, { label: string; start: string; end: string }> = {
  morning: { label: 'Morning', start: '06:00', end: '10:00' },
  midday: { label: 'Midday', start: '10:00', end: '14:00' },
  afternoon: { label: 'Afternoon', start: '14:00', end: '18:00' },
}

function getNextSaturday(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = (6 - day + 7) % 7 || 7
  const sat = new Date(now)
  sat.setDate(now.getDate() + diff)
  return sat.toISOString().split('T')[0]
}

let draft: RoundDraft = {
  date: getNextSaturday(),
  timeWindow: 'morning',
  timeStart: '06:00',
  timeEnd: '10:00',
  courseIds: [],
  spots: 4,
}

export function getDraft(): RoundDraft {
  return { ...draft }
}

export function updateDraft(updates: Partial<RoundDraft>) {
  draft = { ...draft, ...updates }
  // Sync start/end times from timeWindow
  if (updates.timeWindow) {
    const w = TIME_WINDOWS[updates.timeWindow]
    draft.timeStart = w.start
    draft.timeEnd = w.end
  }
}

export function resetDraft() {
  draft = {
    date: getNextSaturday(),
    timeWindow: 'morning',
    timeStart: '06:00',
    timeEnd: '10:00',
    courseIds: [],
    spots: 4,
  }
}
