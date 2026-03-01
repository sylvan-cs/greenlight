import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

// Singleton guard: prevent Vite HMR from creating multiple GoTrueClient instances
const globalKey = '__greenlight_supabase' as const
export const supabase =
  (globalThis as Record<string, unknown>)[globalKey] as SupabaseClient<Database> ??
  ((globalThis as Record<string, unknown>)[globalKey] = createClient<Database>(supabaseUrl, supabaseAnonKey))
