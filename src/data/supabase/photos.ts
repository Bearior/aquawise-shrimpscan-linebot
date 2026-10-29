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
    async put(path, bytes, mime) {
      const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
      if (error) throw dbFail('record-images upload', error)
    },
    async removeObject(path) {
      const { error } = await db.storage.from(PHOTO_BUCKET).remove([path])
      if (error) logger.warn('[db] could not remove an unfinished upload', { error: error.message })
    },
    async addFile({ farmId, lineUserId, ref, mime, bytes, pondId }) {
      const { data, error } = await db
        .from('record_image_files')
        // inbox false: nothing files a scan photo (the inbox is the Drive sweep's queue).
        .insert({ farm_id: farmId, line_user_id: lineUserId, backend: 'supabase', ref, mime, bytes, kind: 'shrimp_scan', pond_ids: [pondId], inbox: false })
        .select('id')
        .single()
      if (error) throw dbFail('record_image_files insert', error)
      return (data as { id: string }).id
    },
    async removeFile(id) {
      const { error } = await db.from('record_image_files').delete().eq('id', id)
      if (error) throw dbFail('record_image_files delete', error)
    },
    async read(imageFileId) {
      const { data, error } = await db.from('record_image_files').select('backend, ref, mime').eq('id', imageFileId).maybeSingle()
      if (error) throw dbFail('record_image_files read', error)
      const row = data as { backend: string; ref: string; mime: string | null } | null
      if (!row || row.backend !== 'supabase') return null
      const got = await db.storage.from(PHOTO_BUCKET).download(row.ref)
      if (got.error || !got.data) {
        logger.warn('[db] could not read a scan photo', { error: got.error?.message ?? 'no data' })
        return null
      }
      return { bytes: Buffer.from(await got.data.arrayBuffer()), mime: row.mime ?? got.data.type }
    },
  }
}
