/**
 * One function per LIFF endpoint. Screens call these, never `fetch`, so the
 * contract in ./types.ts is the only place a path or a shape is spelled.
 */
import { apiFetch, apiUpload } from '@/lib/api-fetch'
import type {
  AskAgainReason,
  FixApplyRequest,
  FixResponse,
  FarmSheet,
  InboxResponse,
  InviteAccept,
  InviteCreate,
  Invite,
  InvitePreview,
  MeasureRequest,
  MeasureResponse,
  MemberPondsResponse,
  MembersResponse,
  Net,
  NetCreate,
  NetEdit,
  NetsResponse,
  NotifySettings,
  Overview,
  PermissionsPatch,
  PermissionsResponse,
  PondDetail,
  PondScansResponse,
  PondSheet,
  PondsResponse,
  Role,
  SaveRequest,
  SaveResponse,
  Scan,
  ScanCreateResponse,
  Session,
  SettingsResponse,
  StartRequest,
  Stocking,
  TeamTodayResponse,
  TodayResponse,
} from './types'

const B = '/api/liff'
const enc = encodeURIComponent

export const api = {
  /* session and start */
  session: () => apiFetch<Session>(`${B}/session`),
  start: (body: StartRequest) => apiFetch<Session>(`${B}/start`, { method: 'POST', body }),
  setTarget: (targetPerKg: number) => apiFetch<Session>(`${B}/farm`, { method: 'PATCH', body: { targetPerKg } }),
  me: () => apiFetch<{ ok: boolean; env: string; user: string }>(`${B}/me`),

  /* ponds */
  ponds: () => apiFetch<PondsResponse>(`${B}/ponds`),
  pond: (id: string) => apiFetch<PondDetail>(`${B}/ponds/${enc(id)}`),
  pondScans: (id: string) => apiFetch<PondScansResponse>(`${B}/ponds/${enc(id)}/scans`),
  stocking: (id: string) => apiFetch<Stocking>(`${B}/ponds/${enc(id)}/stocking`),
  saveStocking: (id: string, body: Stocking) => apiFetch<Stocking>(`${B}/ponds/${enc(id)}/stocking`, { method: 'PUT', body }),
  setPondNet: (id: string, netId: string) => apiFetch<void>(`${B}/ponds/${enc(id)}/net`, { method: 'PUT', body: { netId } }),
  overview: () => apiFetch<Overview>(`${B}/overview`),
  today: () => apiFetch<TodayResponse>(`${B}/today`),
  teamToday: () => apiFetch<TeamTodayResponse>(`${B}/team/today`),

  /* nets */
  nets: () => apiFetch<NetsResponse>(`${B}/nets`),
  addNet: (body: NetCreate) => apiFetch<Net>(`${B}/nets`, { method: 'POST', body }),
  editNet: (id: string, body: NetEdit) => apiFetch<Net>(`${B}/nets/${enc(id)}`, { method: 'PATCH', body }),

  /* scans */
  uploadScan: (pondId: string, photo: Blob) =>
    apiUpload<ScanCreateResponse>(`${B}/scans?pondId=${enc(pondId)}`, photo, { contentType: photo.type || 'image/jpeg' }),
  scan: (id: string) => apiFetch<Scan>(`${B}/scans/${enc(id)}`),
  measure: (id: string, body: MeasureRequest) =>
    // The model call can take a while; a screen shows its own progress.
    apiFetch<MeasureResponse>(`${B}/scans/${enc(id)}/measure`, { method: 'POST', body, timeoutMs: 90_000 }),
  changeNet: (id: string, netId: string) =>
    apiFetch<MeasureResponse>(`${B}/scans/${enc(id)}/net`, { method: 'POST', body: { netId }, timeoutMs: 90_000 }),
  saveScan: (id: string, body: SaveRequest) => apiFetch<SaveResponse>(`${B}/scans/${enc(id)}/save`, { method: 'POST', body }),
  fix: (id: string, rim: FixApplyRequest['rim']) =>
    apiFetch<FixResponse>(`${B}/scans/${enc(id)}/fix`, { method: 'POST', body: { rim }, timeoutMs: 90_000 }),
  fixApply: (id: string, body: FixApplyRequest) => apiFetch<void>(`${B}/scans/${enc(id)}/fix/apply`, { method: 'POST', body }),

  /* inbox */
  inbox: () => apiFetch<InboxResponse>(`${B}/inbox`),
  askAgain: (scanId: string, reason: AskAgainReason) =>
    apiFetch<void>(`${B}/inbox/${enc(scanId)}/ask-again`, { method: 'POST', body: { reason } }),

  /* people */
  members: () => apiFetch<MembersResponse>(`${B}/members`),
  setRole: (id: string, role: Exclude<Role, 'owner'>) => apiFetch<void>(`${B}/members/${enc(id)}`, { method: 'PATCH', body: { role } }),
  removeMember: (id: string) => apiFetch<void>(`${B}/members/${enc(id)}`, { method: 'DELETE' }),
  memberPonds: (id: string) => apiFetch<MemberPondsResponse>(`${B}/members/${enc(id)}/ponds`),
  setMemberPonds: (id: string, pondIds: string[]) =>
    apiFetch<MemberPondsResponse>(`${B}/members/${enc(id)}/ponds`, { method: 'PUT', body: { pondIds } }),
  permissions: (id: string) => apiFetch<PermissionsResponse>(`${B}/members/${enc(id)}/permissions`),
  patchPermissions: (id: string, body: PermissionsPatch) =>
    apiFetch<PermissionsResponse>(`${B}/members/${enc(id)}/permissions`, { method: 'PATCH', body }),
  createInvite: (body: InviteCreate) => apiFetch<Invite>(`${B}/invites`, { method: 'POST', body }),
  cancelInvite: (code: string) => apiFetch<void>(`${B}/invites/${enc(code)}`, { method: 'DELETE' }),
  invite: (code: string) => apiFetch<InvitePreview>(`${B}/invites/${enc(code)}`),
  acceptInvite: (code: string, body: InviteAccept) => apiFetch<Session>(`${B}/invites/${enc(code)}/accept`, { method: 'POST', body }),

  /* settings */
  settings: () => apiFetch<SettingsResponse>(`${B}/settings`),
  saveNotify: (patch: Partial<NotifySettings>) => apiFetch<SettingsResponse>(`${B}/settings`, { method: 'PATCH', body: { notify: patch } }),

  /* print */
  farmSheet: () => apiFetch<FarmSheet>(`${B}/print/farm`),
  pondSheet: (id: string) => apiFetch<PondSheet>(`${B}/print/pond/${enc(id)}`),
  sendSheet: (body: { sheet: 'farm' } | { sheet: 'pond'; pondId: string }) =>
    apiFetch<{ sent: number }>(`${B}/print/send`, { method: 'POST', body }),
}
