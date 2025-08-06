// src/routes/leaderboards.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  Trophy,
  Medal,
  Crown,
  TrendingUp,
  Users,
  Activity,
  Filter
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
  
  // Fetch activity types
  const { data: activityTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: api.activityTypes.list,
  })

  // Auto-select first activity type when available
  const firstActivityType = activityTypes[0]?.id
  const currentActivityType = selectedActivityType || firstActivityType

  // Fetch leaderboard data
  const { 
    data: leaderboardData, 
    isLoading: loadingLeaderboard,
    error 
  } = useQuery({
    queryKey: ['leaderboard', currentActivityType, timeFilter],
    queryFn: () => api.elo.getLeaderboard(currentActivityType, 1, 50),
    enabled: !!currentActivityType,
  })

  // Find current user's position
  const userRank = leaderboardData?.data 
    ? leaderboardData.data.findIndex((entry) => entry.userId === user?.id) + 1
    : 0

  // Only show user rank if they're actually in the leaderboard (rank > 0)
  const showUserRank = userRank > 0

  const isLoading = loadingTypes || loadingLeaderboard

  // Set selected activity type once types are loaded
  if (!selectedActivityType && firstActivityType) {
    setSelectedActivityType(firstActivityType)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
            <Trophy className="h-8 w-8 text-yellow-600" />
            <span>Leaderboards</span>
          </h1>
          <p className="text-gray-600 mt-1">
            See how you stack up against other players
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-700">Filters:</span>
            </div>
            
            <Select
              value={currentActivityType}
              onValueChange={setSelectedActivityType}
              disabled={loadingTypes}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select Activity" />
              </SelectTrigger>
              <SelectContent>
                {activityTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={timeFilter}
              onValueChange={setTimeFilter}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-time">All Time</SelectItem>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="this-week">This Week</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && <LeaderboardSkeleton />}

      {/* Error State */}
      {error && (
        <Card className="p-8 text-center">
          <div className="text-red-600 mb-4">
            <Trophy className="h-12 w-12 mx-auto mb-4" />
            <p>Failed to load leaderboard</p>
          </div>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Card>
      )}

      {/* Main Content */}
      {!isLoading && !error && leaderboardData && (
        <>
          {/* User's Current Position */}
          {showUserRank && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Trophy className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">
                        Your Current Rank
                      </span>
                    </div>
                    <Badge className="bg-blue-600 hover:bg-blue-700">
                      #{userRank}
                    </Badge>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-bold text-blue-900">
                      {leaderboardData.data.find(entry => entry.userId === user?.id)?.eloScore || '--'}
                    </p>
                    <p className="text-xs text-blue-600">ELO Rating</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 3 Podium */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Crown className="h-5 w-5 text-yellow-600" />
                    <span>Top Players</span>
                  </CardTitle>
                  <CardDescription>
                    The current champions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {leaderboardData.data.slice(0, 3).map((entry, index) => (
                    <PodiumCard
                      key={entry.userId}
                      entry={entry}
                      rank={index + 1}
                      isCurrentUser={entry.userId === user?.id}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Full Rankings */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Trophy className="h-5 w-5" />
                      <span>Full Rankings</span>
                    </div>
                    
                    <Badge variant="outline" className="text-xs">
                      {leaderboardData.pagination?.total || leaderboardData.data.length} players
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-gray-500 border-b">
                      <div className="col-span-1">Rank</div>
                      <div className="col-span-6">Player</div>
                      <div className="col-span-2 text-center">ELO</div>
                      <div className="col-span-2 text-center">Games</div>
                      <div className="col-span-1 text-center">Trend</div>
                    </div>
                    
                    {/* Rankings List */}
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {leaderboardData.data.map((entry, index) => (
                        <LeaderboardRow
                          key={entry.userId}
                          entry={entry}
                          rank={index + 1}
                          isCurrentUser={entry.userId === user?.id}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Players</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {leaderboardData.pagination?.total || leaderboardData.data.length}
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Average ELO</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {leaderboardData.data.length > 0
                        ? Math.round(
                            leaderboardData.data.reduce((sum, entry) => sum + entry.eloScore, 0) /
                            leaderboardData.data.length
                          )
                        : '--'
                      }
                    </p>
                  </div>
                  <Trophy className="h-8 w-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Highest ELO</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {leaderboardData.data.length > 0 ? leaderboardData.data[0].eloScore : '--'}
                    </p>
                  </div>
                  <Crown className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// Component implementations
function PodiumCard({ entry, rank, isCurrentUser }: {
  entry: any
  rank: number
  isCurrentUser: boolean
}) {
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="h-6 w-6 text-yellow-500" />
      case 2: return <Medal className="h-6 w-6 text-gray-400" />
      case 3: return <Medal className="h-6 w-6 text-orange-500" />
      default: return <Trophy className="h-6 w-6 text-gray-400" />
    }
  }

  const getRankColors = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white'
      case 2: return 'bg-gradient-to-r from-gray-300 to-gray-500 text-white'
      case 3: return 'bg-gradient-to-r from-orange-400 to-orange-600 text-white'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const userInitials = entry.user?.username
    ?.split(' ')
    .map((name: string) => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <div className={cn(
      "p-4 rounded-lg border-2 transition-all",
      isCurrentUser ? "border-blue-300 bg-blue-50" : "border-gray-200",
      rank <= 3 ? "shadow-lg" : "shadow-sm"
    )}>
      <div className="flex items-center space-x-4">
        <div className={cn(
          "flex items-center justify-center w-12 h-12 rounded-full",
          getRankColors(rank)
        )}>
          {getRankIcon(rank)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={entry.user?.avatarUrl} />
              <AvatarFallback className="text-xs">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className={cn(
                "font-medium truncate",
                isCurrentUser ? "text-blue-900" : "text-gray-900"
              )}>
                {entry.user?.username || 'Unknown'}
              </p>
              <p className="text-xs text-gray-500">
                {entry.gamesPlayed} games
              </p>
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-xl font-bold text-gray-900">
            {entry.eloScore}
          </p>
          {entry.recentChange && (
            <p className={cn(
              "text-xs",
              entry.recentChange > 0 ? "text-green-600" : "text-red-600"
            )}>
              {entry.recentChange > 0 ? '+' : ''}{entry.recentChange}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function LeaderboardRow({ entry, rank, isCurrentUser }: {
  entry: any
  rank: number
  isCurrentUser: boolean
}) {
  const userInitials = entry.user?.username
    ?.split(' ')
    .map((name: string) => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  const getRankBadge = (rank: number) => {
    if (rank <= 3) {
      const colors = {
        1: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        2: 'bg-gray-100 text-gray-800 border-gray-300',
        3: 'bg-orange-100 text-orange-800 border-orange-300'
      }
      return colors[rank as keyof typeof colors] || 'bg-gray-100 text-gray-800'
    }
    return 'bg-gray-50 text-gray-600'
  }

  return (
    <div className={cn(
      "grid grid-cols-12 gap-4 px-4 py-3 rounded-lg transition-colors hover:bg-gray-50",
      isCurrentUser && "bg-blue-50 border border-blue-200"
    )}>
      <div className="col-span-1 flex items-center">
        <Badge className={getRankBadge(rank)}>
          #{rank}
        </Badge>
      </div>
      
      <div className="col-span-6 flex items-center space-x-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={entry.user?.avatarUrl} />
          <AvatarFallback className="text-xs">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-sm font-medium truncate",
            isCurrentUser ? "text-blue-900" : "text-gray-900"
          )}>
            {entry.user?.username || 'Unknown'}
            {isCurrentUser && (
              <Badge variant="outline" className="ml-2 text-xs">
                You
              </Badge>
            )}
          </p>
          <p className="text-xs text-gray-500">
            Last active: {entry.lastActive ? new Date(entry.lastActive).toLocaleDateString() : 'Never'}
          </p>
        </div>
      </div>
      
      <div className="col-span-2 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">{entry.eloScore}</p>
          <p className="text-xs text-gray-500">rating</p>
        </div>
      </div>
      
      <div className="col-span-2 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">{entry.gamesPlayed}</p>
          <p className="text-xs text-gray-500">games</p>
        </div>
      </div>
      
      <div className="col-span-1 flex items-center justify-center">
        {entry.recentChange ? (
          <div className={cn(
            "flex items-center",
            entry.recentChange > 0 ? "text-green-600" : "text-red-600"
          )}>
            <TrendingUp className={cn(
              "h-3 w-3",
              entry.recentChange < 0 && "transform rotate-180"
            )} />
          </div>
        ) : (
          <div className="w-3 h-3 bg-gray-300 rounded-full" />
        )}
      </div>
    </div>
  )
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
            ))}
          </CardContent>
        </Card>
        
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}