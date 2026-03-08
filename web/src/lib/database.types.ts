export type Database = {
  public: {
    Tables: {
      courses: {
        Row: {
          id: string
          name: string
          city: string
          region: string
          booking_url: string | null
        }
        Insert: {
          id?: string
          name: string
          city: string
          region: string
          booking_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          city?: string
          region?: string
          booking_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          phone: string | null
          sms_opt_in: boolean
          email_opt_in: boolean
        }
        Insert: {
          id: string
          phone?: string | null
          sms_opt_in?: boolean
          email_opt_in?: boolean
        }
        Update: {
          id?: string
          phone?: string | null
          sms_opt_in?: boolean
          email_opt_in?: boolean
        }
        Relationships: []
      }
      rounds: {
        Row: {
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
          status: string
          matched_tee_time_id: string | null
          matched_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          round_date: string
          time_window_start: string
          time_window_end: string
          spots_needed: number
          has_specific_time: boolean
          specific_tee_time?: string | null
          specific_course_id?: string | null
          share_code: string
          status: string
          matched_tee_time_id?: string | null
          matched_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          round_date?: string
          time_window_start?: string
          time_window_end?: string
          spots_needed?: number
          has_specific_time?: boolean
          specific_tee_time?: string | null
          specific_course_id?: string | null
          share_code?: string
          status?: string
          matched_tee_time_id?: string | null
          matched_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      round_courses: {
        Row: {
          id: string
          round_id: string
          course_id: string
        }
        Insert: {
          id?: string
          round_id: string
          course_id: string
        }
        Update: {
          id?: string
          round_id?: string
          course_id?: string
        }
        Relationships: []
      }
      rsvps: {
        Row: {
          id: string
          round_id: string
          user_id: string | null
          name: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          round_id: string
          user_id?: string | null
          name: string
          status: string
          created_at?: string
        }
        Update: {
          id?: string
          round_id?: string
          user_id?: string | null
          name?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      tee_times: {
        Row: {
          id: string
          course_id: string
          tee_date: string
          tee_time: string
          is_available: boolean
          price_label: string | null
        }
        Insert: {
          id?: string
          course_id: string
          tee_date: string
          tee_time: string
          is_available: boolean
          price_label?: string | null
        }
        Update: {
          id?: string
          course_id?: string
          tee_date?: string
          tee_time?: string
          is_available?: boolean
          price_label?: string | null
        }
        Relationships: []
      }
      course_requests: {
        Row: {
          id: string
          course_name: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          course_name: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          course_name?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_courses: {
        Row: {
          id: string
          user_id: string
          course_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          course_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          course_id?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
