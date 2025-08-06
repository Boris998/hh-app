// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet, useNavigate } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient } from '@tanstack/react-query'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuthStore } from '@/stores/auth-store'
import { useDeltaPolling } from '@/stores/delta-store'
import { useEffect } from 'react'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const navigate = useNavigate()
  const { isAuthenticated, token, refreshToken } = useAuthStore()
  
  // Initialize delta polling for authenticated users
  useDeltaPolling()

  // Handle token refresh on app startup
  useEffect(() => {
    if (token && !isAuthenticated) {
      // Try to refresh token if we have one but not authenticated
      refreshToken()
    }
  }, [token, isAuthenticated, refreshToken])

  // Redirect to login if not authenticated and trying to access protected routes
  useEffect(() => {
    const currentPath = window.location.pathname
    const isAuthRoute = currentPath.startsWith('/auth/')
    
    if (!isAuthenticated && !isAuthRoute) {
      navigate({ to: '/auth/login' })
    } else if (isAuthenticated && isAuthRoute) {
      navigate({ to: '/' })
    }
  }, [isAuthenticated, navigate])

  return (
    <>
      <MainLayout>
        <Outlet />
      </MainLayout>
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  )
}