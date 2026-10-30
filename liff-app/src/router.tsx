import { Navigate, createBrowserRouter, useSearchParams } from 'react-router-dom'
import { useLiff } from '@/lib/liff/context'
import { resolveDefaultRedirect } from '@/lib/liff-redirect'
import { BootScreen, RequireFarm, SessionGate, useSession } from '@/session'
import { P } from '@/routes'
import ScanFlow from '@/screens/ScanFlow'
import Overview from '@/screens/Overview'
import Ponds from '@/screens/Ponds'
import PondsEdit from '@/screens/PondsEdit'
import Pond from '@/screens/Pond'
import Stocking from '@/screens/Stocking'
import History from '@/screens/History'
import Fix from '@/screens/Fix'
import Inbox from '@/screens/Inbox'
import MeasureFlow from '@/screens/MeasureFlow'
import Settings from '@/screens/Settings'
import Nets from '@/screens/Nets'
import People from '@/screens/People'
import Invite from '@/screens/Invite'
import Permissions from '@/screens/Permissions'
import { PrintFarm, PrintPaper, PrintPick, PrintPond } from '@/screens/Print'
import Start from '@/screens/Start'
import Join from '@/screens/Join'
import Today from '@/screens/Today'
import TeamToday from '@/screens/TeamToday'
import MemberPonds from '@/screens/MemberPonds'
import Me from '@/screens/Me'
import Closed from '@/screens/Closed'

/**
 * `/liff/`: the LIFF endpoint. Hold until the SDK has booted (it reads LINE's
 * one-time OAuth code off the URL), then forward to what liff.state asked for.
 */
function Entry() {
  const { isReady } = useLiff()
  const [params] = useSearchParams()
  if (!isReady) return <BootScreen />
  return <Navigate to={resolveDefaultRedirect(params)} replace />
}

/**
 * Every app screen waits for the SDK too: without it there is no ID token, and
 * the first fetch would 401 (the standalone-screen trap in line-bot's PageShell).
 */
function LiffGate() {
  const { isReady } = useLiff()
  return isReady ? <SessionGate /> : <BootScreen />
}

/** `/liff/app`: the owner lands on the overview, a worker on today's ponds. */
function Home() {
  const { session } = useSession()
  if (session.role === 'worker') return <Navigate to={P.today} replace />
  return <Navigate to={session.permissions.farmOverview ? P.overview : P.ponds} replace />
}

export const router = createBrowserRouter([
  { path: '/liff', element: <Entry /> },
  { path: '/liff/app/closed', element: <Closed /> },
  {
    path: '/liff/app',
    element: <LiffGate />,
    children: [
      { path: 'start', element: <Start /> },
      { path: 'join', element: <Join /> },
      { path: 'me', element: <Me /> },
      {
        element: <RequireFarm />,
        children: [
          { index: true, element: <Home /> },
          { path: 'scan', element: <ScanFlow /> },
          { path: 'today', element: <Today /> },
          { path: 'team', element: <TeamToday /> },
          { path: 'inbox', element: <Inbox /> },
          { path: 'inbox/measure', element: <MeasureFlow /> },
          { path: 'overview', element: <Overview /> },
          { path: 'ponds', element: <Ponds /> },
          { path: 'ponds/edit', element: <PondsEdit /> },
          { path: 'ponds/:id', element: <Pond /> },
          { path: 'ponds/:id/stocking', element: <Stocking /> },
          { path: 'ponds/:id/history', element: <History /> },
          { path: 'scans/:id/fix', element: <Fix /> },
          { path: 'settings', element: <Settings /> },
          { path: 'nets', element: <Nets /> },
          { path: 'people', element: <People /> },
          { path: 'people/invite', element: <Invite /> },
          { path: 'people/:id/permissions', element: <Permissions /> },
          { path: 'people/:id/ponds', element: <MemberPonds /> },
          { path: 'print', element: <PrintPick /> },
          { path: 'print/farm', element: <PrintFarm /> },
          { path: 'print/pond/:id', element: <PrintPond /> },
          { path: 'print/paper', element: <PrintPaper /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/liff" replace /> },
])
