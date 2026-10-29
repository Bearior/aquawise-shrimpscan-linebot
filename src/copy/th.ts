/**
 * Every line of Thai the server sends to LINE. One file, so the owner can read
 * and change the bot's words in one place.
 *
 * Wording follows the mock flow (docs/shrimp-scan-flow-mock in the umbrella,
 * screen O1) and aquawise-docs/00-aquawise-brand-foundation.md (umbrella).
 * APP_NAME is a working name until the owner picks one (D6 in the design doc).
 */
export const APP_NAME = 'AquaWise สแกนกุ้ง'

export const TH = {
  appName: APP_NAME,
  /** follow event. A buttons template body: 160 characters at most. */
  greeting: 'สวัสดีค่ะ น้ำช่วยวัดกุ้งจากรูปยอให้ค่ะ\nลูกน้องสแกนบ่อที่ดูแลทุกวัน พี่เห็นว่าใครสแกนแล้ว กุ้งโตทันไซส์ไหม จับได้วันไหน',
  greetingButton: 'เริ่มใช้',
  /** any text message, until the chat features are built. */
  placeholder: 'ตอนนี้น้ำยังตอบข้อความในแชทไม่ได้ค่ะ กดปุ่มด้านล่างเพื่อเปิดหน้าสแกนกุ้งนะคะ',
  placeholderButton: 'เปิดหน้าสแกนกุ้ง',
  /** reply fallback when a message could not be sent as it was. */
  error: 'ขอโทษค่ะ น้ำส่งข้อความนี้ไม่สำเร็จ ลองใหม่อีกครั้งนะคะ',
  /** The owner's name when LINE gave none (a worker's note chips say who they are for). */
  ownerFallback: 'เจ้าของฟาร์ม',
  /** Who sent a photo, when that person is no longer in the farm. */
  someone: 'คนในฟาร์ม',
} as const
