// src/components/layout/main-layout.tsx - Updated with latest navigation and features
import React from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { 
  Home, 
  Calendar, 
  Users, 
  Trophy, 
  MessageCircle, 
  Menu,
  X,
  Wifi,
  WifiOff,
  AlertCircle,
  Bell,
  UserPlus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useDeltaPolling } from '@/stores/delta-store'
import { useSidebarStore } from '@/stores/sidebar-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserNav } from '@/components/user-nav'
import { useQuery } from '@tanstack/react-query'
import { api, queryKeys } from '@/lib/api'

interface MainLayoutProps {
  children: React.ReactNode
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Activities', href: '/activities', icon: Calendar },
  { name: 'Feed', href: '/feed', icon: MessageCircle },
  { name: 'Invitations', href: '/invitations', icon: UserPlus, badge: 'invitations' },
  { name: 'Leaderboards', href: '/leaderboards', icon: Trophy },
  { name: 'Profile', href: '/profile', icon: Users },
]

export function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter()
  const { pathname } = router.state.location
  const { isAuthenticated, user } = useAuthStore()
  const { connectionStatus } = useDeltaPolling()
  const { isOpen, toggle, close } = useSidebarStore()

  // Fetch notification count for badge
  const { data: notificationData } = useQuery({
    queryKey: queryKeys.notificationCount(),
    queryFn: () => api.notifications.getCount(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
    retry: false,
  })

  // Fetch friend requests for invitations badge
  const { data: friendRequestsData } = useQuery({
    queryKey: queryKeys.friendRequests(),
    queryFn: () => api.users.getFriendRequests(),
    enabled: isAuthenticated,
    refetchInterval: 60000,
    retry: false,
  })

  // Fetch pending skill ratings
  const { data: pendingRatings } = useQuery({
    queryKey: queryKeys.skillRatingsMyPending(),
    queryFn: () => api.skillRatings.getMyPending(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
    retry: false,
  })

  // Calculate badge counts
  const notificationCount = notificationData?.data?.count || 0
  const friendRequestCount = friendRequestsData?.data?.length || 0
  const pendingRatingCount = pendingRatings?.data?.length || 0
  const totalInvitations = friendRequestCount + pendingRatingCount

  // If not authenticated, show auth layout instead
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    )
  }

  const ConnectionStatusIndicator = () => {
    const getStatusIcon = () => {
      switch (connectionStatus) {
        case 'connected':
          return <Wifi className="h-4 w-4 text-green-500" />
        case 'connecting':
          return <Wifi className="h-4 w-4 text-yellow-500 animate-pulse" />
        case 'error':
          return <AlertCircle className="h-4 w-4 text-red-500" />
        default:
          return <WifiOff className="h-4 w-4 text-gray-400" />
      }
    }

    const getStatusText = () => {
      switch (connectionStatus) {
        case 'connected':
          return 'Connected'
        case 'connecting':
          return 'Connecting...'
        case 'error':
          return 'Connection Error'
        default:
          return 'Disconnected'
      }
    }

    return (
      <div className="flex items-center space-x-2 px-3 py-2 text-xs text-gray-500">
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
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
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo/Brand */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">HabitBuilder</span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={close} 
              className="lg:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              let badgeCount = 0

              // Calculate badge counts
              if (item.badge === 'invitations') {
                badgeCount = totalInvitations
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  )}
                  onClick={() => {
                    // Close mobile sidebar when navigating
                    if (window.innerWidth < 1024) {
                      close()
                    }
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </div>
                  {badgeCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="h-5 w-5 p-0 text-xs flex items-center justify-center"
                    >
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </Badge>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* User info at bottom */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                {user?.avatarUrl ? (
                  <img 
                    src={user.avatarUrl} 
                    alt={user.username}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-gray-700">
                    {user?.username.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.username}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <ConnectionStatusIndicator />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Page title - could be dynamic based on route */}
            <div className="flex-1 lg:flex lg:items-center lg:justify-between">
              <h1 className="text-2xl font-semibold text-gray-900 capitalize hidden lg:block">
                {pathname === '/' ? 'Dashboard' : pathname.slice(1).replace('/', ' / ')}
              </h1>
              
              {/* Right side - notifications and user nav */}
              <div className="flex items-center space-x-4 ml-auto">
                {/* Notifications */}
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="h-5 w-5" />
                    {notificationCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center"
                      >
                        {notificationCount > 9 ? '9+' : notificationCount}
                      </Badge>
                    )}
                  </Button>

                {/* User navigation */}
                <UserNav />
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6 px-4 sm:px-6 lg:px-8 w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}