/**
 * Words used on more than one screen. Screen-specific lines sit in the screen,
 * written as the mock wrote them (docs/shrimp-scan-flow-mock, round 3).
 *
 * Voice: น้ำ speaks (ค่ะ), short sentences, specific numbers, no "AI" or
 * "platform". No em dash anywhere: two sentences, or the middle dot " · ".
 */
import type { Role } from '@/api/types'

export const APP_NAME = 'AquaWise สแกนกุ้ง'

/**
 * The worker's role word. The mock says ลูกน้อง; staging's น้องน้ำ glossary
 * says คนงาน, and both apps share one members table. Open decision for Bear:
 * change it here and every screen follows.
 */
export const WORKER = 'ลูกน้อง'

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'เจ้าของ',
  manager: 'ผู้จัดการ',
  worker: WORKER,
}

export const NET_SHAPE_LABEL = { round: 'ยอกลม', square: 'ยอสี่เหลี่ยม' } as const

export const ERR = {
  generic: 'มีอะไรผิดพลาดค่ะ ลองใหม่อีกครั้งนะคะ',
  offline: 'ต่ออินเทอร์เน็ตไม่ได้ค่ะ ลองใหม่อีกครั้งนะคะ',
  timeout: 'รอนานเกินไปค่ะ ลองใหม่อีกครั้งนะคะ',
  auth: 'เข้าสู่ระบบไม่สำเร็จค่ะ ปิดหน้านี้แล้วเปิดจากเมนูอีกครั้งนะคะ',
  /** Outside the LINE app, where ลองใหม่ logs in again. */
  authRenew: 'เข้าสู่ระบบไม่สำเร็จค่ะ กดลองใหม่เพื่อเข้าสู่ระบบอีกครั้งนะคะ',
  notReady: 'ส่วนนี้ยังไม่เปิดใช้ค่ะ',
  notReadySub: 'ทีมงานกำลังเปิดส่วนนี้อยู่ค่ะ ลองใหม่อีกครั้งภายหลังนะคะ',
  noCredits: 'เครดิตสแกนของฟาร์มหมดแล้วค่ะ ให้เจ้าของเติมก่อนนะคะ',
  notAllowed: 'บัญชีนี้ยังทำส่วนนี้ไม่ได้ค่ะ ขอเจ้าของเปิดสิทธิ์ให้นะคะ',
  remeasureLimit: 'รูปนี้วัดใหม่ฟรีครบ 3 ครั้งแล้วค่ะ ถ่ายรูปใหม่แทนนะคะ',
  retry: 'ลองใหม่',
} as const

export const LOADING = 'กำลังโหลด'
