export type DayPart = 'morning' | 'midday' | 'afternoon'

export const DAY_PARTS: DayPart[] = ['morning', 'midday', 'afternoon']

export const DAY_PART_META: Record<DayPart, { label: string; start: string; end: string }> = {
  morning: { label: 'Morning', start: '06:00', end: '10:00' },
  midday: { label: 'Midday', start: '10:00', end: '14:00' },
  afternoon: { label: 'Afternoon', start: '14:00', end: '18:00' },
}

export interface InvitedUser {
  id: string
  full_name: string
  email: string
}

export const MAX_ROUND_DATES = 7

export interface RoundDraft {
  /** Earliest selected date — kept for backward compat, mirrors `dates[0]`. */
  date: string
  /** All selected dates (ascending). At least one. */
  dates: string[]
  dayParts: DayPart[]
  useCustomTime: boolean
  timeStart: string
  timeEnd: string
  courseIds: string[]
  spots: number
  invitedUsers: InvitedUser[]
  /** Group IDs to "notify" (soft broadcast — does NOT pre-create RSVPs). */
  notifyGroupIds: string[]
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

const initialDate = getNextSaturday()

let draft: RoundDraft = {
  date: initialDate,
  dates: [initialDate],
  dayParts: ['morning'],
  useCustomTime: false,
  timeStart: '06:00',
  timeEnd: '10:00',
  courseIds: [],
  spots: 4,
  invitedUsers: [],
  notifyGroupIds: [],
}

export function getDraft(): RoundDraft {
  return {
    ...draft,
    dates: [...draft.dates],
    dayParts: [...draft.dayParts],
    invitedUsers: [...draft.invitedUsers],
    notifyGroupIds: [...draft.notifyGroupIds],
  }
}

export function updateDraft(updates: Partial<RoundDraft>) {
  draft = { ...draft, ...updates }
  // Keep dates sorted and date in sync with dates[0] for legacy callers.
  if (updates.dates) {
    draft.dates = [...new Set(updates.dates)].sort().slice(0, MAX_ROUND_DATES)
    if (draft.dates.length === 0) draft.dates = [getNextSaturday()]
    draft.date = draft.dates[0]
  } else if (updates.date) {
    // Single-date legacy update — mirror into dates if not explicitly set.
    if (!draft.dates.includes(updates.date)) {
      draft.dates = [updates.date]
    }
  }
  // Sync start/end times from dayParts (skip for custom — uses explicit timeStart/timeEnd)
  if (!draft.useCustomTime && updates.dayParts) {
    const range = computeTimeRange(draft.dayParts)
    draft.timeStart = range.start
    draft.timeEnd = range.end
  }
}

export function resetDraft() {
  const d = getNextSaturday()
  draft = {
    date: d,
    dates: [d],
    dayParts: ['morning'],
    useCustomTime: false,
    timeStart: '06:00',
    timeEnd: '10:00',
    courseIds: [],
    spots: 4,
    invitedUsers: [],
    notifyGroupIds: [],
  }
}
