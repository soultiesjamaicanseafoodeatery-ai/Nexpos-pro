'use client'

import AuthScreen from '@/components/auth/AuthScreen'
import AppShell from '@/components/layout/AppShell'
import ToastContainer from '@/components/shared/ToastContainer'
import { useApp } from '@/lib/hooks/useAppStore'

export default function Home() {
  const { state } = useApp()

  return (
    <>
      {state.currentUser ? <AppShell /> : <AuthScreen />}
      <ToastContainer />
    </>
  )
}
