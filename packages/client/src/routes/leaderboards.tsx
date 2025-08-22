// src/routes/leaderboards.tsx - Updated with enhanced backend features
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  Trophy,
  Medal,
  Crown,
  TrendingUp,
  Star,
  Award
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, queryKeys } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/leaderboards')({
  component: LeaderboardsPage,
})

function LeaderboardsPage() {
  const { user } = useAuthStore()
  const [selectedActivityType, setSelectedActivityType] = useState<string>('')
  const [timeFilter, setTimeFilter] = useState<string>('all-time')
  const [activeTab, setActiveTab] = useState('elo')
  
  // Fetch activity types
  const { data: activityTypesData, isLoading: loadingTypes } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: () => api.activityTypes.list(),
  })

  // Auto-select first activity type when available
  const activityTypes = activityTypesData?.data?.activityTypes || []
  const firstActivityType = activityTypes[0]?.id
  const currentActivityType = selectedActivityType || firstActivityType

  // Fetch ELO leaderboard data
  const { 
    data: eloLeaderboardData, 
    isLoading: loadingELOLeaderboard,
    error: eloError 
  } = useQuery({
    queryKey: ['elo-leaderboard', currentActivityType, timeFilter],
    queryFn: () => api.elo.getLeaderboard(currentActivityType, 1, 50),
    enabled: !!currentActivityType,
  })

  // Fetch skill definitions for skill leaderboards
  const { data: skillDefinitionsData } = useQuery({
    queryKey: queryKeys.skillDefinitions(),
    queryFn: () => api.skills.getDefinitions(),
    enabled: activeTab === 'skills',
  })

  // Find current user's position in ELO leaderboard
  const userELORank = eloLeaderboardData?.data 
    ? eloLeaderboardData.data.findIndex(entry => entry.user.id === user?.id) + 1
    : null

  const leaderboardData = eloLeaderboardData?.data || []
  const skillDefinitions = skillDefinitionsData?.data || []

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />
      case 3:
        return <Medal className="h-5 w-5 text-orange-600" />
      default:
        return <span className="text-lg font-bold text-gray-600">{rank}</span>
    }
  }

  const getRankBadgeColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 2:
        return 'bg-gray-100 text-gray-800 border-gray-300'
      case 3:
        return 'bg-orange-100 text-orange-800 border-orange-300'
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300'
    }
  }

  const getELORating = (eloScore: number) => {
    if (eloScore >= 2200) return { name: 'Master', color: 'text-purple-600' }
    if (eloScore >= 2000) return { name: 'Expert', color: 'text-red-600' }
    if (eloScore >= 1800) return { name: 'Advanced', color: 'text-orange-600' }
    if (eloScore >= 1600) return { name: 'Intermediate', color: 'text-blue-600' }
    if (eloScore >= 1400) return { name: 'Beginner+', color: 'text-green-600' }
    return { name: 'Beginner', color: 'text-gray-600' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leaderboards</h1>
          <p className="text-gray-600 mt-1">
            See how you rank against other athletes
          </p>
        </div>
        
        {/* Filters */}
        <div className="flex items-center space-x-4 mt-4 sm:mt-0">
          <Select value={selectedActivityType} onValueChange={setSelectedActivityType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Activity Type" />
            </SelectTrigger>
            <SelectContent>
              {activityTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-time">All Time</SelectItem>
              <SelectItem value="monthly">This Month</SelectItem>
              <SelectItem value="weekly">This Week</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* User's Current Rank Card */}
      {userELORank && currentActivityType && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-full">
                  {getRankIcon(userELORank)}
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900">Your Current Rank</h3>
                  <p className="text-blue-700">
                    #{userELORank} in {activityTypes.find(t => t.id === currentActivityType)?.name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-900">
                  {leaderboardData.find(entry => entry.user.id === user?.id)?.eloScore || 'N/A'}
                </p>
                <p className="text-sm text-blue-700">ELO Rating</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Leaderboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="elo">ELO Rankings</TabsTrigger>
          <TabsTrigger value="skills">Skill Rankings</TabsTrigger>
        </TabsList>

        {/* ELO Leaderboard */}
        <TabsContent value="elo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Trophy className="h-6 w-6 mr-2 text-yellow-600" />
                ELO Leaderboard
                {currentActivityType && (
                  <Badge variant="outline" className="ml-2">
                    {activityTypes.find(t => t.id === currentActivityType)?.name}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Competitive rankings based on game performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingELOLeaderboard ? (
                <div className="space-y-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-4 p-4">
                      <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/6"></div>
                      </div>
                      <div className="h-6 bg-gray-200 rounded w-16"></div>
                    </div>
                  ))}
                </div>
              ) : eloError ? (
                <div className="text-center py-8">
                  <p className="text-red-600">Failed to load leaderboard data</p>
                  <Button onClick={() => window.location.reload()} className="mt-2">
                    Try Again
                  </Button>
                </div>
              ) : leaderboardData.length === 0 ? (
                <div className="text-center py-12">
                  <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Rankings Yet</h3>
                  <p className="text-gray-600">
                    Be the first to compete in this activity type!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboardData.map((entry, index) => {
                    const rank = index + 1
                    const isCurrentUser = entry.user.id === user?.id
                    const rating = getELORating(entry.eloScore)
                    
                    return (
                      <div
                        key={entry.user.id}
                        className={cn(
                          "flex items-center space-x-4 p-4 rounded-lg transition-colors",
                          isCurrentUser 
                            ? "bg-blue-50 border-2 border-blue-200" 
                            : "hover:bg-gray-50",
                          rank <= 3 && "bg-gradient-to-r from-yellow-50 to-transparent"
                        )}
                      >
                        {/* Rank */}
                        <div className="flex items-center justify-center w-8 h-8">
                          {getRankIcon(rank)}
                        </div>
                        
                        {/* User Avatar and Info */}
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={entry.user.avatarUrl} alt={entry.user.username} />
                          <AvatarFallback>
                            {entry.user.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <p className={cn(
                              "font-medium truncate",
                              isCurrentUser && "text-blue-900"
                            )}>
                              {entry.user.username}
                            </p>
                            {isCurrentUser && (
                              <Badge variant="secondary" className="text-xs">You</Badge>
                            )}
                            {rank <= 3 && (
                              <Badge className={getRankBadgeColor(rank)}>
                                {rank === 1 ? 'Champion' : rank === 2 ? 'Runner-up' : '3rd Place'}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <span>{entry.gamesPlayed} games</span>
                            <span className={rating.color}>{rating.name}</span>
                            {entry.change && (
                              <div className="flex items-center space-x-1">
                                <TrendingUp className={cn(
                                  "h-3 w-3",
                                  entry.change > 0 ? "text-green-600" : "text-red-600"
                                )} />
                                <span className={cn(
                                  "text-xs",
                                  entry.change > 0 ? "text-green-600" : "text-red-600"
                                )}>
                                  {entry.change > 0 ? '+' : ''}{entry.change}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* ELO Score */}
                        <div className="text-right">
                          <p className="text-xl font-bold">{entry.eloScore}</p>
                          <p className="text-sm text-gray-600">ELO</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Skills Leaderboard */}
        <TabsContent value="skills" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Star className="h-6 w-6 mr-2 text-blue-600" />
                Skill Rankings
              </CardTitle>
              <CardDescription>
                Top performers in specific skills based on peer ratings
              </CardDescription>
            </CardHeader>
            <CardContent>
              {skillDefinitions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {skillDefinitions.slice(0, 6).map((skill: any) => (
                    <div key={skill.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium">{skill.skillType}</h3>
                        <Badge variant={skill.isGeneral ? "default" : "secondary"}>
                          {skill.isGeneral ? "General" : "Specific"}
                        </Badge>
                      </div>
                      
                      {/* Mini skill leaderboard would go here */}
                      <div className="space-y-2">
                        <div className="text-center py-4 text-gray-500">
                          <Award className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                          <p className="text-sm">Skill rankings coming soon</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Star className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Skills Available</h3>
                  <p className="text-gray-600">
                    Skill rankings will appear as users participate in activities
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}