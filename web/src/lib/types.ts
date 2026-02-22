export interface Round {
  id: string
  creator_id: string
  round_date: string
  time_window_start: string
  time_window_end: string
  spots_needed: number
  has_specific_time: boolean
  specific_tee_time: string | null
  specific_course_id: string | null
  share_code: string
  status: 'open' | 'watching' | 'found' | 'booked' | 'cancelled'
  matched_tee_time_id: string | null
  matched_at: string | null
  created_at: string
}

export interface Course {
  id: string
  name: string
  city: string
  region: string
  booking_url?: string
}

export interface RoundCourse {
  id: string
  round_id: string
  course_id: string
  courses?: Course
}

export interface Rsvp {
  id: string
  round_id: string
  user_id: string | null
  name: string
  status: 'in' | 'maybe' | 'out'
  created_at: string
}

export interface TeeTime {
  id: string
  course_id: string
  tee_date: string
  tee_time: string
  is_available: boolean
  price_label: string | null
  courses?: Course
}

export interface RoundWithDetails extends Round {
  round_courses: (RoundCourse & { courses: Course })[]
  rsvps: Rsvp[]
  creator_name?: string
}
