import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
// Vendored fonts (no Google Fonts round trip on rural 3G): the weights the screens use.
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/500.css'
import '@fontsource/noto-sans-thai/600.css'
import '@fontsource/noto-sans-thai/700.css'
import '@fontsource/noto-sans-thai/800.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/jetbrains-mono/800.css'
import './styles/app.css'
import { IconSprite } from '@/components/Icon'
import { LiffProvider } from '@/lib/liff/context'
import { router } from './router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LiffProvider>
      <IconSprite />
      <RouterProvider router={router} />
    </LiffProvider>
  </StrictMode>,
)
