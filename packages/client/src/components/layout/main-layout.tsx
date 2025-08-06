// src/components/layout/main-layout.tsx
import React from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { 
  Home, 
  Calendar, 
  Users, 
  Trophy, 
  MessageCircle, 
  Settings,
  Menu,
  X,
  Wifi,
  WifiOff,
  AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useDeltaPolling } from '@/stores/delta-store'
import { useSidebarStore } from '@/stores/sidebar-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserNav } from '@/components/user-nav'

interface MainLayoutProps {
  children: React.ReactNode
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Activities', href: '/activities', icon: Calendar },
  { name: 'Feed', href: '/feed', icon: MessageCircle },
  { name: 'Invitations', href: '/invitations', icon: Users, badge: 'invitations' },
  { name: 'Leaderboards', href: '/leaderboards', icon: Trophy },
  { name: 'Profile', href: '/profile', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter()
  const { pathname } = router.state.location
  const { isAuthenticated } = useAuthStore()
  const { connectionStatus } = useDeltaPolling()
  const { isOpen, toggle, close } = useSidebarStore()

  // If not authenticated, show auth layout instead
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 lg:hidden z-40"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b">
            <Link 
              to="/" 
              className="flex items-center space-x-2"
              onClick={close}
            >
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">SportSync</span>
            </Link>
            
            {/* Close button for mobile */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={close}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href))
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={close}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className={cn(
                      "h-5 w-5",
                      isActive ? "text-blue-700" : "text-gray-500"
                    )} />
                    <span>{item.name}</span>
                  </div>
                  
                  {/* Badge for notifications */}
                  {item.badge && (
                    <Badge variant="destructive" className="h-5 px-2 text-xs">
                      3
                    </Badge>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Connection Status */}
          <div className="p-4 border-t">
            <div className="flex items-center space-x-2 text-xs">
              {connectionStatus === 'connected' ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Connected</span>
                </>
              ) : connectionStatus === 'polling' ? (
                <>
                  <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-blue-600">Syncing...</span>
                </>
              ) : connectionStatus === 'error' ? (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">Connection error</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-500">Disconnected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="bg-white shadow-sm border-b h-16">
          <div className="flex items-center justify-between h-full px-4 sm:px-6">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={toggle}
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Page title */}
            <div className="hidden lg:block">
              <h1 className="text-xl font-semibold text-gray-900">
                {getPageTitle(pathname)}
              </h1>
            </div>

            {/* User navigation */}
            <UserNav />
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/activities')) return 'Activities'
  if (pathname.startsWith('/feed')) return 'Activity Feed'
  if (pathname.startsWith('/invitations')) return 'Invitations'
  if (pathname.startsWith('/leaderboards')) return 'Leaderboards'
  if (pathname.startsWith('/profile')) return 'Profile'
  if (pathname.startsWith('/settings')) return 'Settings'
  return 'SportSync'
}