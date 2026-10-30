import type { PondStatus, PondTile } from '@/api/types'

/** The CSS letter of each state, shared by รายบ่อ, หน้าบ่อ and เลือกบ่อ. */
export const KIND: Record<PondStatus, 'r' | 'g' | 'w' | 'u' | 'm'> = { ready: 'r', good: 'g', watch: 'w', urgent: 'u', missing: 'm' }

/** A state as a pill: its tone and its name. */
export const STATUS_PILL: Record<PondStatus, ['rd' | 'gr' | 'wn' | 'bd', string]> = {
  ready: ['rd', 'พร้อมจับ'],
  good: ['gr', 'กำลังโต'],
  watch: ['wn', 'เฝ้าระวัง'],
  urgent: ['bd', 'ต้องดู'],
  missing: ['bd', 'ยังไม่สแกน'],
}

/** The server's reason ('โตช้ามาก วันละ 0.19 ก.') cut to the words a tile has room for. */
export function shortIssue(issue: string | null): string {
  if (!issue) return 'ต้องดู'
  if (issue.startsWith('แตกไซส์')) return 'แตกไซส์'
  if (issue.startsWith('โตช้า')) return 'โตช้ามาก'
  if (issue.startsWith('ไซส์เริ่มไม่เสมอ') || issue.startsWith('ไซส์ไม่เสมอ')) return 'ไซส์ไม่เสมอ'
  return 'ต้องดู'
}

/** The words under a pond's number: why it is yellow or red, else when it reaches the size. */
export function tileWord(p: PondTile): string {
  if (p.status === 'missing') return 'ยังไม่สแกน'
  if (p.status === 'urgent' || p.status === 'watch') return shortIssue(p.issue)
  if (p.daysToTarget === null) return 'ยังไม่รู้'
  return p.daysToTarget <= 0 ? 'จับได้วันนี้' : `อีก ${p.daysToTarget} วัน`
}

/** How close a pond is to the farm's size, 0 to 1 (the line under a tile). */
export function progressTo(p: PondTile, targetPerKg: number): number {
  if (p.perKg === null || p.perKg <= 0) return 0
  return Math.max(0, Math.min(1, targetPerKg / p.perKg))
}
