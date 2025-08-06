// src/routes/profile/_layout.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ProfileSubnav } from '@/components/profile/subnav'
import { useAuthStore } from '@/stores/auth-store'
import { api, queryKeys } from '@/lib/api'
import { ProfileHeader } from '../../components/profile/profile-header'

export const Route = createFileRoute()({
  component: ProfileLayout,
})

function ProfileLayout() {
  const { user } = useAuthStore()

  // Fetch user profile data
  const { data: profileData, isLoading } = useQuery({
    queryKey: queryKeys.user(user?.id || ''),
    queryFn: () => api.users.getProfile(user?.id || ''),
    enabled: !!user?.id,
  })

  if (!user) {
    return <div>Please log in to view your profile.</div>
  }

  return (
    <div className="space-y-6">
      <ProfileHeader user={user} profileData={profileData} isLoading={isLoading} />
      <ProfileSubnav />
      <Outlet />
    </div>
  )
}