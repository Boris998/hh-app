// src/routes/profile/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { 
  Trophy,
  Activity,
  Users,
  Calendar,
  Target
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'
import { api, queryKeys } from '@/lib/api'

export const Route = createFileRoute('/profile/')({
  component: ProfileOverview,
})

function ProfileOverview() {
  const { user } = useAuthStore()

  // Fetch comprehensive profile stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ['profile', 'overview', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      
      const [quickStats, eloData, recentActivities] = await Promise.all([
        api.users.getQuickStats(user.id),
        api.elo.getUserELO(user.id),
        api.activities.list({ page: 1, limit: 5, createdBy: user.id }),
      ])

      return {
        quickStats,
        eloData: eloData.data,
        recentActivities: recentActivities.data?.activities || [],
      }
    },
    enabled: !!user?.id,
  })

  if (!user) {
    return <div>Please log in to view your profile.</div>
  }

  if (isLoading) {
    return <ProfileOverviewSkeleton />
  }

  const { quickStats, eloData = [], recentActivities = [] } = stats || {}

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Activities"
          value={quickStats?.data.totalActivities || 0}
          icon={Activity}
          description="All time participation"
        />
        
        <StatCard
          title="Average ELO"
          value={quickStats?.data.averageELO ? quickStats.data.averageELO.toFixed(0) : '--'}
          icon={Trophy}
          description="Across all activities"
        />
        
        <StatCard
          title="Friends"
          value={quickStats?.data.friendsCount || 0}
          icon={Users}
          description="Connected athletes"
        />
        
        <StatCard
          title="This Week"
          value={quickStats?.data.activitiesThisWeek || 0}
          icon={Calendar}
          description="Activities participated"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ELO Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Trophy className="h-5 w-5" />
              <span>ELO Ratings</span>
            </CardTitle>
            <CardDescription>
              Your performance across different activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eloData.length > 0 ? (
              <div className="space-y-4">
                {eloData.slice(0, 5).map((elo:any) => (
                  <ELORatingItem key={elo.activityTypeId} elo={elo} />
                ))}
                
                {eloData.length > 5 && (
                  <p className="text-sm text-gray-500 text-center pt-2">
                    And {eloData.length - 5} more activities...
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No ELO ratings yet</p>
                <p className="text-sm">Join competitive activities to build your ratings</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Recent Activities</span>
            </CardTitle>
            <CardDescription>
              Your latest activity participation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivities.length > 0 ? (
              <div className="space-y-4">
                {recentActivities.map((activity) => (
                  <RecentActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No recent activities</p>
                <p className="text-sm">Join or create activities to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Achievement Highlights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Achievements</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <AchievementBadge
              title="First Activity"
              description="Participated in your first activity"
              achieved={(quickStats?.data.totalActivities ?? 0) > 0}
            />
            
            <AchievementBadge
              title="Social Butterfly"
              description="Connected with 5 friends"
              achieved={(quickStats?.data.friendsCount ?? 0) >= 5}
            />
            
            <AchievementBadge
              title="Consistent Player"
              description="Active for 7 consecutive days"
              achieved={false} // This would come from backend
            />
            
            <AchievementBadge
              title="ELO Climber"
              description="Reached 1500 ELO in any activity"
              achieved={eloData.some((elo:any) => elo.eloScore >= 1500)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Component implementations
function StatCard({ title, value, icon: Icon, description }: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  description: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
          
          <div className="p-3 rounded-full bg-blue-100">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ELORatingItem({ elo }: { elo: any }) {
  const getRatingColor = (rating: number) => {
    if (rating >= 1600) return 'text-purple-600 bg-purple-100'
    if (rating >= 1400) return 'text-blue-600 bg-blue-100'
    if (rating >= 1200) return 'text-green-600 bg-green-100'
    return 'text-gray-600 bg-gray-100'
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center space-x-3">
        <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
          <Trophy className="h-4 w-4 text-orange-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">
            {elo.activityType?.name}
          </p>
          <p className="text-xs text-gray-500">
            {elo.gamesPlayed} games played
          </p>
        </div>
      </div>
      
      <Badge className={getRatingColor(elo.eloScore)}>
        {elo.eloScore}
      </Badge>
    </div>
  )
}

function RecentActivityItem({ activity }: { activity: any }) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {activity.activityType?.name}
        </p>
        <p className="text-xs text-gray-500">
          {formatDate(activity.dateTime)} • {activity.location}
        </p>
      </div>
      
      <Badge variant="outline" className="text-xs">
        {activity.status}
      </Badge>
    </div>
  )
}

function AchievementBadge({ title, description, achieved }: {
  title: string
  description: string
  achieved: boolean
}) {
  return (
    <div className={`p-4 rounded-lg border-2 text-center ${
      achieved 
        ? 'border-yellow-200 bg-yellow-50' 
        : 'border-gray-200 bg-gray-50'
    }`}>
      <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${
        achieved 
          ? 'bg-yellow-200 text-yellow-800' 
          : 'bg-gray-200 text-gray-400'
      }`}>
        <Target className="h-4 w-4" />
      </div>
      <h4 className={`text-sm font-medium ${
        achieved ? 'text-yellow-800' : 'text-gray-500'
      }`}>
        {title}
      </h4>
      <p className={`text-xs mt-1 ${
        achieved ? 'text-yellow-600' : 'text-gray-400'
      }`}>
        {description}
      </p>
    </div>
  )
}

function ProfileOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="h-12 w-12 bg-gray-200 rounded-full animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-16 bg-gray-100 rounded animate-pulse" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}