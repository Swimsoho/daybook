import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// When env vars are absent the app runs in demo mode (in-memory sample data).
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
