import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

// Simple in-memory lock to replace Navigator.locks which causes timeouts
const locks = new Map<string, Promise<any>>()

// Singleton guard: prevent Vite HMR from creating multiple GoTrueClient instances
const globalKey = '__greenlight_supabase' as const
export const supabase =
  (globalThis as Record<string, unknown>)[globalKey] as ReturnType<typeof createClient<Database>> ??
  ((globalThis as Record<string, unknown>)[globalKey] = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
      lock: async (name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
        const existing = locks.get(name)
        if (existing) {
          await existing
        }
        const promise = fn().finally(() => {
          if (locks.get(name) === promise) {
            locks.delete(name)
          }
        })
        locks.set(name, promise)
        return await promise
      },
    },
  }))
