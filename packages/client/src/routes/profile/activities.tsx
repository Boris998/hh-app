// src/routes/profile/activities.tsx - Updated with enhanced backend features
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { 
  Calendar, 
  MapPin, 
  Users, 
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  BarChart3,
  Target
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, queryKeys } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { formatDate } from '..'

export const Route = createFileRoute('/profile/activities')({
  component: ProfileActivitiesPage,
})

function ProfileActivitiesPage() {
  const { user } = useAuthStore()
  const [selectedActivityType, setSelectedActivityType] = useState<string>('all')
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch activity types for filtering
  const { data: activityTypesData } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: () => api.activityTypes.list(),
  })

  // Fetch user's activities (only those the user has joined)
  const { data: userActivitiesData, isLoading: loadingActivities } = useQuery({
    queryKey: queryKeys.activities({ 
      participationStatus: 'accepted',
      ...(selectedActivityType !== 'all' && selectedActivityType && { activityTypeId: selectedActivityType })
    }),
    queryFn: () => {
      const params = {
        // Try without participationStatus filter to see all activities where user participated
        // participationStatus: 'accepted' as const,
        limit: 50,
        ...(selectedActivityType !== 'all' && selectedActivityType && { activityTypeId: selectedActivityType })
      };
      console.log('🔍 API call params:', params);
      return api.activities.list(params).then(response => {
        console.log('🔍 API response:', response);
        return response;
      });
    },
    enabled: !!user?.id,
  })

  // Fetch user's ELO data
  const { data: userELOData } = useQuery({
    queryKey: queryKeys.userELO(user?.id || '', selectedActivityType || undefined),
    queryFn: () => api.users.getELO(user?.id || '', selectedActivityType !== 'all' ? selectedActivityType : undefined),
    enabled: !!user?.id,
  })

  // Fetch user's skill ratings
  const { data: userSkillsData } = useQuery({
    queryKey: queryKeys.userSkills(user?.id || '', selectedActivityType || undefined),
    queryFn: () => api.users.getSkills(user?.id || '', selectedActivityType !== 'all' ? selectedActivityType : undefined),
    enabled: !!user?.id,
  })

  // Fetch user's activity stats
  const { data: userStatsData } = useQuery({
    queryKey: queryKeys.userActivityStats(user?.id || '', selectedActivityType !== 'all' ? selectedActivityType : undefined),
    queryFn: () => api.users.getActivityStats(user?.id || ''),
    enabled: !!user?.id,
  })

  // Fetch pending skill ratings
  const { data: pendingRatingsData } = useQuery({
    queryKey: queryKeys.skillRatingsMyPending(),
    queryFn: () => api.skillRatings.getMyPending(),
    enabled: !!user?.id,
  })

  const activityTypes = activityTypesData?.data?.activityTypes || []
  const userActivities = userActivitiesData?.data?.activities || []
  const userELOs = userELOData?.data || []
  const userSkills = userSkillsData?.data || []
  const userStats = userStatsData?.data
  const pendingRatings = pendingRatingsData?.data || []

  // Filter ELOs by selected activity type
  const filteredELOs = selectedActivityType && selectedActivityType !== 'all'
    ? userELOs.filter(elo => elo.activityTypeId === selectedActivityType)
    : userELOs

  const getELOTrend = (elo: any) => {
    if (!elo.change) return { icon: Minus, color: 'text-gray-500' }
    if (elo.change > 0) return { icon: TrendingUp, color: 'text-green-600' }
    if (elo.change < 0) return { icon: TrendingDown, color: 'text-red-600' }
    return { icon: Minus, color: 'text-gray-500' }
  }

  const getActivityStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800'
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'completed':
        return 'bg-gray-100 text-gray-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Activities</h1>
          <p className="text-gray-600 mt-1">
            Track your progress and view your performance
          </p>
        </div>
        
        {/* Activity Type Filter */}
        <div className="mt-4 sm:mt-0">
          <Select value={selectedActivityType} onValueChange={setSelectedActivityType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Activity Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity Types</SelectItem>
              {Array.isArray(activityTypes) && activityTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

 {/* Quick Stats */}
      {userStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{userStats.totalActivities}</p>
                  <p className="text-sm text-gray-600">Total Activities</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Trophy className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{userStats.averageELO?.toFixed(0) || 'N/A'}</p>
                  <p className="text-sm text-gray-600">Average ELO</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <BarChart3 className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{userStats.activitiesThisWeek}</p>
                  <p className="text-sm text-gray-600">This Week</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-2xl font-bold">{pendingRatings.length}</p>
                  <p className="text-sm text-gray-600">Pending Ratings</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="elo">ELO Ratings</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Pending Ratings Alert */}
          {pendingRatings.length > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-orange-800 flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  Pending Skill Ratings ({pendingRatings.length})
                </CardTitle>
                <CardDescription className="text-orange-700">
                  You have activities where you need to rate other participants
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingRatings.slice(0, 3).map((activity: any) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                      <div>
                        <p className="font-medium">{activity.activityType?.name}</p>
                        <p className="text-sm text-gray-600">{formatDate(activity.dateTime)}</p>
                      </div>
                      <Link to={`/skill-ratings/activity/${activity.id}`}>
                        <Button size="sm">Rate Participants</Button>
                      </Link>
                    </div>
                  ))}
                  {pendingRatings.length > 3 && (
                    <Link to="/skill-ratings">
                      <Button variant="outline" className="w-full">
                        View All Pending Ratings
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick ELO Overview */}
          <Card>
            <CardHeader>
              <CardTitle>ELO Ratings Overview</CardTitle>
              <CardDescription>Your current ratings across activity types</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredELOs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredELOs.map((elo: any) => {
                    const activityType = activityTypes.find(type => type.id === elo.activityTypeId)
                    const trend = getELOTrend(elo)
                    const TrendIcon = trend.icon
                    
                    return (
                      <div key={elo.activityTypeId} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{activityType?.name}</h4>
                          <div className="flex items-center space-x-1">
                            <TrendIcon className={cn("h-4 w-4", trend.color)} />
                            {elo.change && (
                              <span className={cn("text-sm font-medium", trend.color)}>
                                {elo.change > 0 ? '+' : ''}{elo.change}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold">{elo.eloScore}</span>
                          <span className="text-sm text-gray-600">{elo.gamesPlayed} games</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-600 text-center py-8">
                  No ELO ratings yet. Join some activities to start building your ratings!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ELO Tab */}
        <TabsContent value="elo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>ELO Ratings</CardTitle>
              <CardDescription>
                Your competitive ratings across different activity types
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredELOs.length > 0 ? (
                <div className="space-y-4">
                  {filteredELOs.map((elo: any) => {
                    const activityType = activityTypes.find(type => type.id === elo.activityTypeId)
                    const trend = getELOTrend(elo)
                    const TrendIcon = trend.icon
                    
                    return (
                      <div key={elo.activityTypeId} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <Trophy className="h-6 w-6 text-blue-600" />
                            <div>
                              <h3 className="font-medium">{activityType?.name}</h3>
                              <p className="text-sm text-gray-600">{activityType?.category?.replace('_', ' ')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center space-x-2">
                              <span className="text-2xl font-bold">{elo.eloScore}</span>
                              <div className="flex items-center space-x-1">
                                <TrendIcon className={cn("h-4 w-4", trend.color)} />
                                {elo.change && (
                                  <span className={cn("text-sm font-medium", trend.color)}>
                                    {elo.change > 0 ? '+' : ''}{elo.change}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-600">{elo.gamesPlayed} games played</p>
                          </div>
                        </div>
                        
                        {/* Additional ELO Stats */}
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                          <div className="text-center">
                            <p className="text-lg font-semibold">{elo.peakELO || elo.eloScore}</p>
                            <p className="text-xs text-gray-600">Peak Rating</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-semibold">{elo.winRate?.toFixed(1) || 'N/A'}%</p>
                            <p className="text-xs text-gray-600">Win Rate</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-semibold">{elo.rank || 'Unranked'}</p>
                            <p className="text-xs text-gray-600">Rank</p>
                          </div>
                        </div>
                        
                        {/* View History Link */}
                        <div className="pt-4 border-t mt-4">
                          <Link to={`/leaderboards`}>
                            <Button variant="outline" size="sm" className="w-full">
                              View ELO History
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No ELO Ratings Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Participate in ELO-rated activities to start building your competitive ratings
                  </p>
                  <Link to="/activities">
                    <Button>Browse Activities</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent value="skills" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Skill Ratings</CardTitle>
              <CardDescription>
                Your peer-rated skills {selectedActivityType ? `for ${activityTypes.find(t => t.id === selectedActivityType)?.name}` : 'across all activities'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userSkills.length > 0 ? (
                <div className="space-y-4">
                  {userSkills.map((skill: any) => (
                    <div key={skill.skillDefinitionId} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{skill.skillName}</h4>
                          <p className="text-sm text-gray-600">
                            {skill.isGeneral ? 'General Skill' : 'Activity-Specific'}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center space-x-2">
                            <span className="text-2xl font-bold">
                              {skill.averageRating?.toFixed(1) || 'N/A'}
                            </span>
                            <span className="text-sm text-gray-600">/10</span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {skill.totalRatings} rating{skill.totalRatings !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      
                      {/* Rating Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(skill.averageRating / 10) * 100}%` }}
                        />
                      </div>
                      
                      {/* Trend Indicator */}
                      {skill.trend && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Trend:</span>
                          <div className="flex items-center space-x-1">
                            {skill.trend === 'improving' && (
                              <>
                                <TrendingUp className="h-4 w-4 text-green-600" />
                                <span className="text-green-600">Improving</span>
                              </>
                            )}
                            {skill.trend === 'declining' && (
                              <>
                                <TrendingDown className="h-4 w-4 text-red-600" />
                                <span className="text-red-600">Declining</span>
                              </>
                            )}
                            {skill.trend === 'stable' && (
                              <>
                                <Minus className="h-4 w-4 text-gray-600" />
                                <span className="text-gray-600">Stable</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Skill Ratings Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Complete activities and receive skill ratings from other participants
                  </p>
                  <Link to="/activities">
                    <Button>Join Activities</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activities Tab */}
        <TabsContent value="activities" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>My Activities</CardTitle>
              <CardDescription>
                Activities you've created or participated in
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingActivities ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse p-4 border rounded-lg">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : userActivities.length > 0 ? (
                <div className="space-y-4">
                  {userActivities.map((activity: any) => {
                    const activityId = activity.activity?.id || activity.id
                    const activityTypeId = activity.activity?.activityTypeId || activity.activityTypeId
                    const activityType = activityTypes.find(type => type.id === activityTypeId) || activity.activityType
                    
                    return (
                      <Link key={activityId} to={`/activities/${activityId}`}>
                        <div className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <Trophy className="h-5 w-5 text-blue-600" />
                              <h4 className="font-medium">{activityType?.name}</h4>
                            </div>
                            <Badge className={getActivityStatusColor(activity.activity?.completionStatus || activity.completionStatus)}>
                              {activity.activity?.completionStatus || activity.completionStatus}
                            </Badge>
                          </div>
                          
                          <p className="text-gray-600 mb-3 line-clamp-2">{activity.activity?.description || activity.description}</p>
                          
                          <div className="flex items-center justify-between text-sm text-gray-600">
                            <div className="flex items-center space-x-4">
                              {(activity.activity?.location || activity.location) && (
                                <div className="flex items-center">
                                  <MapPin className="h-4 w-4 mr-1" />
                                  {activity.activity?.location || activity.location}
                                </div>
                              )}
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                {formatDate(activity.activity?.dateTime || activity.dateTime)}
                              </div>
                              <div className="flex items-center">
                                <Users className="h-4 w-4 mr-1" />
                                {activity.participantCount || 0} participants
                              </div>
                            </div>
                            
                            {(activity.activity?.eloLevel || activity.eloLevel) && (
                              <Badge variant="secondary">
                                ELO {activity.activity?.eloLevel || activity.eloLevel}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Activities Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Create your first activity or join existing ones
                  </p>
                  <div className="flex items-center justify-center space-x-4">
                    <Link to="/activities/create">
                      <Button>Create Activity</Button>
                    </Link>
                    <Link to="/activities">
                      <Button variant="outline">Browse Activities</Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}