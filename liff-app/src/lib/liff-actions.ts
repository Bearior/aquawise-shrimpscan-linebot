/**
 * The LIFF SDK actions the screens use: send a line into the chat as the
 * person, close the window, share an invite card, open a URL outside LINE.
 *
 * Outside the LINE client (the mock, a desktop browser) these cannot run, so
 * each one answers what happened instead, and the caller shows that.
 */
import liff from '@line/liff'
import { MOCK } from './mock-persona'

function inClient(): boolean {
  if (MOCK) return false
  try {
    return liff.isInClient()
  } catch {
    return false
  }
}

export type SendOutcome = 'sent' | 'not_in_client' | 'failed'

/** liff.sendMessages: the line shows in the chat as the person (W22's "สแกน F10 แล้ว"). */
export async function sendChatText(text: string): Promise<SendOutcome> {
  if (!inClient()) return 'not_in_client'
  try {
    await liff.sendMessages([{ type: 'text', text }])
    return 'sent'
  } catch {
    return 'failed'
  }
}

/** Close the LIFF and go back to the chat. False when there is no window to close. */
export function closeLiff(): boolean {
  if (!inClient()) return false
  try {
    liff.closeWindow()
    return true
  } catch {
    return false
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable'

/**
 * liff.shareTargetPicker with a Flex invite card (W1). The card goes out under
 * the owner's own name, so it costs no OA quota and the worker trusts it.
 */
export async function shareInvite(opts: { farmName: string; ownerName: string; pondsLabel: string; url: string }): Promise<ShareOutcome> {
  if (MOCK) return 'unavailable'
  try {
    if (!liff.isApiAvailable('shareTargetPicker')) return 'unavailable'
    const res = await liff.shareTargetPicker([
      {
        type: 'flex',
        altText: `${opts.ownerName}ชวนเข้า${opts.farmName}`,
        contents: {
          type: 'bubble',
          size: 'giga',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'คำเชิญเข้าฟาร์ม', size: 'sm', weight: 'bold', color: '#004AAD' },
              { type: 'text', text: `${opts.ownerName}ชวนเข้า${opts.farmName}`, size: 'xl', weight: 'bold', wrap: true },
              { type: 'text', text: `ดูแลบ่อ ${opts.pondsLabel} · สแกนกุ้งผ่าน LINE`, size: 'md', color: '#4F4E62', wrap: true },
              { type: 'text', text: 'กดแล้วเพิ่มเพื่อน AquaWise สแกนกุ้ง และเข้าฟาร์มทันที', size: 'md', color: '#4F4E62', wrap: true },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'button', style: 'primary', color: '#004AAD', action: { type: 'uri', label: 'เข้าร่วมฟาร์ม', uri: opts.url } },
            ],
          },
        },
      },
    ])
    return res ? 'shared' : 'cancelled'
  } catch {
    return 'unavailable'
  }
}

/** Open a URL in the phone's own browser (printing a PDF; LINE's webview may not print). */
export function openExternal(url: string): void {
  if (inClient()) {
    try {
      liff.openWindow({ url, external: true })
      return
    } catch {
      /* fall through to a plain open */
    }
  }
  window.open(url, '_blank', 'noopener')
}
