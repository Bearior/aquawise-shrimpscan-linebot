import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../../lib/logger.js'
import type { PhotosRepo } from '../types.js'
import { dbFail } from './errors.js'

export const PHOTO_BUCKET = 'record-images'
/** Signed URLs live an hour, like line-bot's record photos. */
export const SIGNED_URL_SECONDS = 3600

export function supabasePhotos(db: SupabaseClient): PhotosRepo {
  return {
    async urls(ids) {
      const unique = [...new Set(ids)]
      if (!unique.length) return {}
      const { data, error } = await db.from('record_image_files').select('id, backend, ref').in('id', unique)
      if (error) throw dbFail('record_image_files read', error)
      // Only the Supabase bucket is ours to sign; a Drive-backed photo is left out.
      const rows = ((data as { id: string; backend: string; ref: string }[] | null) ?? []).filter((r) => r.backend === 'supabase')
      if (!rows.length) return {}
      const signed = await db.storage.from(PHOTO_BUCKET).createSignedUrls(
        rows.map((r) => r.ref),
        SIGNED_URL_SECONDS,
      )
      if (signed.error) {
        logger.warn('[db] could not sign photo URLs', { error: signed.error.message })
        return {}
      }
      const byRef = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))
      const out: Record<string, string> = {}
      for (const r of rows) {
        const url = byRef.get(r.ref)
        if (url) out[r.id] = url
      }
      return out
    },
  }
}
