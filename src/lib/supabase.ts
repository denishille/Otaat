import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Ohne Env-Variablen laeuft OTAAT komplett lokal weiter. */
export const supabase: SupabaseClient | null =
  url && key && url.startsWith('http')
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null

export const cloudEnabled = supabase !== null
