export type DayPart = 'morning' | 'midday' | 'afternoon'

export const DAY_PARTS: DayPart[] = ['morning', 'midday', 'afternoon']

export const DAY_PART_META: Record<DayPart, { label: string; start: string; end: string }> = {
  morning: { label: 'Morning', start: '06:00', end: '10:00' },
  midday: { label: 'Midday', start: '10:00', end: '14:00' },
  afternoon: { label: 'Afternoon', start: '14:00', end: '18:00' },
}

export interface RoundDraft {
  date: string
  dayParts: DayPart[]
  useCustomTime: boolean
  timeStart: string
  timeEnd: string
  courseIds: string[]
  spots: number
}

/** Compute the combined start/end from selected day parts */
export function computeTimeRange(parts: DayPart[]): { start: string; end: string } {
  if (parts.length === 0) return { start: '06:00', end: '10:00' }
  const starts = parts.map(p => DAY_PART_META[p].start).sort()
  const ends = parts.map(p => DAY_PART_META[p].end).sort()
  return { start: starts[0], end: ends[ends.length - 1] }
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
  dayParts: ['morning'],
  useCustomTime: false,
  timeStart: '06:00',
  timeEnd: '10:00',
  courseIds: [],
  spots: 4,
}

export function getDraft(): RoundDraft {
  return { ...draft, dayParts: [...draft.dayParts] }
}

export function updateDraft(updates: Partial<RoundDraft>) {
  draft = { ...draft, ...updates }
  // Sync start/end times from dayParts (skip for custom — uses explicit timeStart/timeEnd)
  if (!draft.useCustomTime && updates.dayParts) {
    const range = computeTimeRange(draft.dayParts)
    draft.timeStart = range.start
    draft.timeEnd = range.end
  }
}

export function resetDraft() {
  draft = {
    date: getNextSaturday(),
    dayParts: ['morning'],
    useCustomTime: false,
    timeStart: '06:00',
    timeEnd: '10:00',
    courseIds: [],
    spots: 4,
  }
}
