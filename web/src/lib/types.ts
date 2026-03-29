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
  email: string | null
  status: 'in' | 'maybe' | 'out' | 'invited'
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

export interface UserCourse {
  id: string
  user_id: string
  course_id: string
  created_at: string
  courses?: Course
}

export interface ProfileSearchResult {
  id: string
  full_name: string
  email: string
}

export interface Group {
  id: string
  name: string
  created_by: string
  invite_code: string
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  profiles?: { id: string; full_name: string; email: string }
}

export interface GroupWithMembers extends Group {
  group_members: GroupMember[]
}

export interface RoundWithDetails extends Round {
  round_courses: (RoundCourse & { courses: Course })[]
  rsvps: Rsvp[]
  creator_name?: string
}
