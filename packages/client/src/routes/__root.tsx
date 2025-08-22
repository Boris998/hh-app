// src/routes/__root.tsx - Root route with layout and auth handling
import { createRootRoute, Outlet, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import React from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuthStore } from '@/stores/auth-store'

// Auth Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const currentPath = router.state.location.pathname
      
      // Allow access to auth routes when not authenticated
      const publicRoutes = ['/auth/login', '/auth/register']
      if (!publicRoutes.includes(currentPath)) {
        router.navigate({ to: '/auth/login' })
      }
    }
  }, [isAuthenticated, isLoading, router])

  // Show loading state during authentication check
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

// Root component
function RootComponent() {
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()
  const currentPath = router.state.location.pathname

  // Auth routes that don't need the main layout
  const authRoutes = ['/auth/login', '/auth/register']
  const isAuthRoute = authRoutes.includes(currentPath)

  // Redirect authenticated users away from auth pages
  React.useEffect(() => {
    if (isAuthenticated && isAuthRoute) {
      router.navigate({ to: '/' })
    }
  }, [isAuthenticated, isAuthRoute, router])

  return (
    <AuthGuard>
      {isAuthenticated || isAuthRoute ? (
        isAuthRoute ? (
          // Auth pages without main layout
          <div className="min-h-screen bg-gray-50">
            <Outlet />
          </div>
        ) : (
          // Main app with layout
          <MainLayout>
            <Outlet />
          </MainLayout>
        )
      ) : (
        // Fallback for unauthenticated users
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to HabitBuilder</h1>
            <p className="text-gray-600 mb-4">Please sign in to continue</p>
            <button
              onClick={() => router.navigate({ to: '/auth/login' })}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      )}
      
      {/* Development tools */}
      {process.env.NODE_ENV === 'development' && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </AuthGuard>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
})