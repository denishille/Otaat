import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from '../data/otaat-source'

/**
 * Ohne gueltige Adresse laeuft OTAAT komplett lokal weiter — der Stand liegt
 * dann nur im localStorage. Die Vorgabe steht in `otaat-source.ts`, eine
 * `.env` sticht sie aus.
 */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http')
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

export const cloudEnabled = supabase !== null
