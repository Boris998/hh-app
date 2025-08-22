// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { 
  Calendar,
  Trophy,
  Users,
  Activity,
  TrendingUp,
  MapPin,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { api, queryKeys } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { Link } from '@tanstack/react-router'
// Using basic date formatting instead of date-fns
export const formatDate = (date: Date | string) => {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const { user } = useAuthStore()

  // Fetch user's dashboard data
  const { data: dashboardData, isLoading: loadingElo } = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      
      const [
        quickStats,
        recentActivities,
        upcomingActivities,
        invitations,
        eloData
      ] = await Promise.all([
        api.users.getQuickStats(user.id),
        api.activities.list({ page: 1, limit: 5 }),
        api.activities.list({ 
          page: 1, 
          limit: 5,
          dateFrom: new Date().toISOString(),
        }),
        api.invitations.list(),
        api.elo.getUserELO(user.id),
      ])

      return {
        quickStats,
        recentActivities: recentActivities.data?.activities || [],
        upcomingActivities: upcomingActivities.data?.activities || [],
        invitations,
        eloData,
      }
    },
    enabled: !!user?.id,
    refetchInterval: 60000, // Refetch every minute
  })

  if (!user) {
    return <div>Please log in to view your dashboard.</div>
  }

  if (loadingElo) {
    return <DashboardSkeleton />
  }

  const stats = dashboardData?.quickStats
  const recentActivities = dashboardData?.recentActivities || []
  const upcomingActivities = dashboardData?.upcomingActivities || []
  const invitations = dashboardData?.invitations || []
  const eloData = dashboardData?.eloData.data || []

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user.username}!
          </h1>
          <p className="text-gray-600 mt-1">
            Here's what's happening with your activities
          </p>
        </div>
        
        <Link to="/activities/create">
          <Button className="flex items-center space-x-2">
            <Calendar className="h-4 w-4" />
            <span>Create Activity</span>
          </Button>
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Average ELO"
          value={stats?.data.averageELO ? stats.data.averageELO.toFixed(0) : '--'}
          icon={Trophy}
          trend={stats?.data.averageELO}
          trendLabel="vs last week"
        />
        
        <StatCard
          title="Activities This Week"
          value={stats?.data.activitiesThisWeek || 0}
          icon={Activity}
          trend={stats?.data.averageELO}
          trendLabel="vs last week"
        />
        
        <StatCard
          title="Friends"
          value={stats?.data.friendsCount || 0}
          icon={Users}
          description="Connected athletes"
        />
        
        <StatCard
          title="Pending Invitations"
          value={invitations.length}
          icon={Calendar}
          description="Waiting for your response"
          highlight={invitations.length > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Upcoming Activities</span>
            </CardTitle>
            <CardDescription>
              Your scheduled activities for the next few days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingActivities.length > 0 ? (
              <div className="space-y-4">
                {upcomingActivities.slice(0, 5).map((activity:any, index:number) => {
                  const uniqueKey = activity.id ? `${activity.id}-upcoming-${index}` : `upcoming-activity-${index}`;
                  return (
                    <ActivityListItem key={uniqueKey} activity={activity} />
                  );
                })}
                
                {upcomingActivities.length > 5 && (
                  <Link to="/activities" className="block">
                    <Button variant="ghost" className="w-full">
                      View all activities
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No upcoming activities</p>
                <Link to="/activities">
                  <Button variant="outline" className="mt-2">
                    Browse Activities
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ELO Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Trophy className="h-5 w-5" />
              <span>ELO Rankings</span>
            </CardTitle>
            <CardDescription>
              Your performance across different activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eloData.length > 0 ? (
              <div className="space-y-4">
                {eloData.slice(0, 5).map((elo:any, index:number) => {
                  const uniqueKey = elo.activityTypeId ? `${elo.activityTypeId}-elo-${index}` : `elo-${index}`;
                  return (
                    <ELOListItem key={uniqueKey} elo={elo} />
                  );
                })}
                
                <Link to="/profile/activities" className="block">
                  <Button variant="ghost" className="w-full">
                    View detailed stats
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No ELO data yet</p>
                <p className="text-sm">Join activities to start building your rating</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Feed */}
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
              {recentActivities.map((activity:any, index:number) => {
                // Create a unique key combining ID and index to handle duplicates
                const uniqueKey = activity.id ? `${activity.id}-${index}` : `recent-activity-${index}`;
                return (
                  <RecentActivityItem key={uniqueKey} activity={activity} />
                );
              })}
              
              <Link to="/feed" className="block">
                <Button variant="ghost" className="w-full">
                  View activity feed
                </Button>
              </Link>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No recent activities</p>
              <Link to="/activities">
                <Button variant="outline" className="mt-2">
                  Join an Activity
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  trend?: number
  trendLabel?: string
  description?: string
  highlight?: boolean
}

function StatCard({ title, value, icon: Icon, trend, trendLabel, description, highlight }: StatCardProps) {
  return (
    <Card className={highlight ? 'border-blue-200 bg-blue-50' : ''}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            
            {description && (
              <p className="text-xs text-gray-500">{description}</p>
            )}
            
            {trend !== undefined && trendLabel && (
              <div className="flex items-center space-x-1">
                <TrendingUp className={`h-3 w-3 ${
                  trend > 0 ? 'text-green-500' : 
                  trend < 0 ? 'text-red-500' : 'text-gray-400'
                }`} />
                <span className={`text-xs ${
                  trend > 0 ? 'text-green-600' : 
                  trend < 0 ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {trend > 0 ? '+' : ''}{trend}% {trendLabel}
                </span>
              </div>
            )}
          </div>
          
          <div className={`p-3 rounded-full ${
            highlight ? 'bg-blue-100' : 'bg-gray-100'
          }`}>
            <Icon className={`h-6 w-6 ${
              highlight ? 'text-blue-600' : 'text-gray-600'
            }`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityListItem({ activity }: { activity: any }) {
  return (
    <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
      <div className="flex-shrink-0">
        <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
          <Calendar className="h-5 w-5 text-blue-600" />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <Link to="/activities/$activityId" params={{activityId: activity.id}}>
          <p className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate">
            {activity.description || activity.activityType?.name}
          </p>
        </Link>
        
        <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
          <Clock className="h-3 w-3" />
          <span>{formatDate(activity.dateTime)}</span>
          
          {activity.location && (
            <>
              <MapPin className="h-3 w-3" />
              <span>{activity.location}</span>
            </>
          )}
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        <Badge variant="outline" className="text-xs">
          {activity.participants?.length || 0}/{activity.maxParticipants || '∞'}
        </Badge>
        
        {activity.eloLevel && (
          <Badge variant="secondary" className="text-xs">
            ELO {activity.eloLevel}
          </Badge>
        )}
      </div>
    </div>
  )
}

function ELOListItem({ elo }: { elo: any }) {
  return (
    <div className="flex items-center justify-between">
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
      
      <div className="text-right">
        <p className="text-lg font-bold text-gray-900">{elo.eloScore}</p>
        {elo.change && (
          <p className={`text-xs ${
            elo.change > 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {elo.change > 0 ? '+' : ''}{elo.change}
          </p>
        )}
      </div>
    </div>
  )
}

function RecentActivityItem({ activity }: { activity: any }) {
  return (
    <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
      <Avatar className="h-8 w-8">
        <AvatarImage src={activity.creator?.avatarUrl} />
        <AvatarFallback>
          {activity.creator?.username?.[0]?.toUpperCase() || 'A'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">
          <span className="font-medium">{activity.creator?.username}</span>
          {' '}created{' '}
          <Link 
            to="/activities/$activityId" params={{activityId: activity.id}}
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            {activity.activityType?.name}
          </Link>
        </p>
        
        <p className="text-xs text-gray-500 mt-1">
          {formatDate(activity.createdAt)}
        </p>
      </div>
      
      <Badge variant="outline" className="text-xs">
        {activity.status || 'Active'}
      </Badge>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
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
              <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
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