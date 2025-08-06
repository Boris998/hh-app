// src/routes/profile/activities.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  Trophy,
  TrendingUp,
  Calendar,
  Users,
  Activity,
  BarChart3,
  Target
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
import { ResponsiveLine } from '@nivo/line'
import { ResponsiveRadar } from '@nivo/radar'
import { ResponsiveBar } from '@nivo/bar'
import { useAuthStore } from '@/stores/auth-store'
import { api, queryKeys } from '@/lib/api'

export const Route = createFileRoute('/profile/activities')({
  component: ProfileActivitiesPage,
})

function ProfileActivitiesPage() {
  const { user } = useAuthStore()
  const [selectedActivityType, setSelectedActivityType] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<string>('30') // days

  // Fetch activity types
  const { data: activityTypes = [] } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: api.activityTypes.list,
  })

  // Fetch user's ELO data
  const { data: eloData = [], isLoading: eloLoading } = useQuery({
    queryKey: queryKeys.userELO(user?.id || '', selectedActivityType === 'all' ? undefined : selectedActivityType),
    queryFn: () => api.elo.getUserELO(user?.id || '', selectedActivityType === 'all' ? undefined : selectedActivityType),
    enabled: !!user?.id,
  })

  // Fetch ELO history for charts
  const { data: eloHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['elo-history', user?.id, selectedActivityType, timeRange],
    queryFn: async () => {
      if (!user?.id || selectedActivityType === 'all') return []
      return api.elo.getHistory(user.id, selectedActivityType, parseInt(timeRange))
    },
    enabled: !!user?.id && selectedActivityType !== 'all',
  })

  // Fetch user's skills data
  const { data: skillsData = [], isLoading: skillsLoading } = useQuery({
    queryKey: queryKeys.userSkills(user?.id || '', selectedActivityType === 'all' ? undefined : selectedActivityType),
    queryFn: () => api.skills.getUserSkills(user?.id || '', selectedActivityType === 'all' ? undefined : selectedActivityType),
    enabled: !!user?.id,
  })

  // Fetch user's activity participation stats
  const { data: activityStats, isLoading: statsLoading } = useQuery({
    queryKey: ['activity-stats', user?.id, selectedActivityType],
    queryFn: async () => {
      if (!user?.id) return null
      
      // This would be a custom endpoint that returns participation stats
      const response = await fetch(`/api/users/${user.id}/activity-stats?activityType=${selectedActivityType}`)
      return response.json()
    },
    enabled: !!user?.id,
  })

  if (!user) {
    return <div>Please log in to view your activities.</div>
  }

  const isLoading = eloLoading || historyLoading || skillsLoading || statsLoading

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Select
          value={selectedActivityType}
          onValueChange={setSelectedActivityType}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Activity Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activities</SelectItem>
            {activityTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedActivityType !== 'all' && (
          <Select
            value={timeRange}
            onValueChange={setTimeRange}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 3 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading && <ActivityPageSkeleton />}

      {!isLoading && (
        <>
          {/* ELO Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ELOStatCard
              title="Current ELO"
              value={selectedActivityType === 'all' 
                ? (eloData.length > 0 ? Math.round(eloData.reduce((sum:number, elo:any) => sum + elo.eloScore, 0) / eloData.length) : 0)
                : (eloData[0]?.eloScore || 0)
              }
              icon={Trophy}
              trend={selectedActivityType !== 'all' ? eloHistory.slice(-7) : undefined}
            />
            
            <ELOStatCard
              title="Peak ELO"
              value={selectedActivityType === 'all'
                ? Math.max(...eloData.map((elo:any) => elo.peakELO || elo.eloScore), 0)
                : (eloData[0]?.peakELO || eloData[0]?.eloScore || 0)
              }
              icon={TrendingUp}
              description="All-time high"
            />
            
            <ELOStatCard
              title="Games Played"
              value={selectedActivityType === 'all'
                ? eloData.reduce((sum:number, elo:any) => sum + (elo.gamesPlayed || 0), 0)
                : (eloData[0]?.gamesPlayed || 0)
              }
              icon={Activity}
              description={selectedActivityType === 'all' ? 'Total across all activities' : 'In this activity'}
            />
          </div>

          {/* Charts Section */}
          {selectedActivityType !== 'all' && eloHistory.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ELO History Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart3 className="h-5 w-5" />
                    <span>ELO Progression</span>
                  </CardTitle>
                  <CardDescription>
                    Your ELO rating over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveLine
                      data={[{
                        id: 'ELO',
                        data: eloHistory.map(entry => ({
                          x: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          y: entry.elo
                        }))
                      }]}
                      margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
                      xScale={{ type: 'point' }}
                      yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                      curve="monotoneX"
                      axisTop={null}
                      axisRight={null}
                      axisBottom={{
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: -45,
                        legend: 'Date',
                        legendOffset: 45,
                        legendPosition: 'middle'
                      }}
                      axisLeft={{
                        tickSize: 5,
                        tickPadding: 5,
                        tickRotation: 0,
                        legend: 'ELO Rating',
                        legendOffset: -50,
                        legendPosition: 'middle'
                      }}
                      colors={['#2563eb']}
                      pointSize={8}
                      pointColor="#2563eb"
                      pointBorderWidth={2}
                      pointBorderColor="#ffffff"
                      useMesh={true}
                      theme={{
                        axis: {
                          domain: {
                            line: {
                              stroke: '#e5e7eb',
                              strokeWidth: 1
                            }
                          },
                          legend: {
                            text: {
                              fontSize: 12,
                              fontWeight: 500
                            }
                          },
                          ticks: {
                            line: {
                              stroke: '#e5e7eb',
                              strokeWidth: 1
                            },
                            text: {
                              fontSize: 11
                            }
                          }
                        },
                        grid: {
                          line: {
                            stroke: '#f3f4f6',
                            strokeWidth: 1
                          }
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Skills Radar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Target className="h-5 w-5" />
                    <span>Skills Breakdown</span>
                  </CardTitle>
                  <CardDescription>
                    Your performance across different skills
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {skillsData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveRadar
                        data={skillsData}
                        keys={['averageRating']}
                        indexBy="skillName"
                        valueFormat=">-.1f"
                        margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
                        borderColor={{ from: 'color' }}
                        gridLabelOffset={16}
                        dotSize={8}
                        dotColor={{ theme: 'background' }}
                        dotBorderWidth={2}
                        colors={['#059669']}
                        blendMode="multiply"
                        motionConfig="wobbly"
                        theme={{
                          axis: {
                            domain: {
                              line: {
                                stroke: 'transparent'
                              }
                            },
                            ticks: {
                              line: {
                                stroke: '#e5e7eb',
                                strokeWidth: 1
                              },
                              text: {
                                fontSize: 11
                              }
                            }
                          },
                          grid: {
                            line: {
                              stroke: '#f3f4f6',
                              strokeWidth: 1
                            }
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <Target className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>No skills data yet</p>
                        <p className="text-sm">Participate in activities to get skill ratings</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ELO Rankings Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Trophy className="h-5 w-5" />
                <span>Your ELO Rankings</span>
              </CardTitle>
              <CardDescription>
                Your performance across all activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eloData.length > 0 ? (
                <div className="space-y-4">
                  {eloData.map((elo:any, index:number) => (
                    <ELORankingRow key={elo.activityTypeId} elo={elo} rank={index + 1} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No ELO rankings yet</p>
                  <p className="text-sm">Join competitive activities to build your ELO ratings</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Participation Stats */}
          {activityStats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Activity Participation</span>
                </CardTitle>
                <CardDescription>
                  Your activity patterns over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveBar
                    data={activityStats.monthlyData || []}
                    keys={['activities']}
                    indexBy="month"
                    margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
                    padding={0.3}
                    valueScale={{ type: 'linear' }}
                    indexScale={{ type: 'band', round: true }}
                    colors={['#3b82f6']}
                    borderColor={{
                      from: 'color',
                      modifiers: [['darker', 1.6]]
                    }}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: -45,
                      legend: 'Month',
                      legendPosition: 'middle',
                      legendOffset: 45
                    }}
                    axisLeft={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: 0,
                      legend: 'Activities',
                      legendPosition: 'middle',
                      legendOffset: -50
                    }}
                    labelSkipWidth={12}
                    labelSkipHeight={12}
                    labelTextColor={{
                      from: 'color',
                      modifiers: [['darker', 1.6]]
                    }}
                    animate={true}
                    motionConfig="gentle"
                    theme={{
                      axis: {
                        domain: {
                          line: {
                            stroke: '#e5e7eb',
                            strokeWidth: 1
                          }
                        },
                        legend: {
                          text: {
                            fontSize: 12,
                            fontWeight: 500
                          }
                        },
                        ticks: {
                          line: {
                            stroke: '#e5e7eb',
                            strokeWidth: 1
                          },
                          text: {
                            fontSize: 11
                          }
                        }
                      },
                      grid: {
                        line: {
                          stroke: '#f3f4f6',
                          strokeWidth: 1
                        }
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// Component implementations
function ELOStatCard({ title, value, icon: Icon, trend, description }: {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  trend?: any[]
  description?: string
}) {
  const getTrendDirection = () => {
    if (!trend || trend.length < 2) return null
    const first = trend[0]?.elo || 0
    const last = trend[trend.length - 1]?.elo || 0
    return last > first ? 'up' : last < first ? 'down' : 'neutral'
  }

  const trendDirection = getTrendDirection()

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            
            {description && (
              <p className="text-xs text-gray-500">{description}</p>
            )}
            
            {trendDirection && (
              <div className="flex items-center space-x-1">
                <TrendingUp className={`h-3 w-3 ${
                  trendDirection === 'up' ? 'text-green-500' : 
                  trendDirection === 'down' ? 'text-red-500 transform rotate-180' : 
                  'text-gray-400'
                }`} />
                <span className={`text-xs ${
                  trendDirection === 'up' ? 'text-green-600' : 
                  trendDirection === 'down' ? 'text-red-600' : 
                  'text-gray-600'
                }`}>
                  {trendDirection === 'up' ? 'Trending up' : 
                   trendDirection === 'down' ? 'Trending down' : 
                   'Stable'}
                </span>
              </div>
            )}
          </div>
          
          <div className="p-3 rounded-full bg-blue-100">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ELORankingRow({ elo, rank }: { elo: any; rank: number }) {
  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-600 bg-yellow-100'
    if (rank === 2) return 'text-gray-600 bg-gray-100'
    if (rank === 3) return 'text-orange-600 bg-orange-100'
    return 'text-blue-600 bg-blue-100'
  }

  const getRatingColor = (rating: number) => {
    if (rating >= 1800) return 'text-purple-600 bg-purple-100'
    if (rating >= 1600) return 'text-blue-600 bg-blue-100'
    if (rating >= 1400) return 'text-green-600 bg-green-100'
    if (rating >= 1200) return 'text-yellow-600 bg-yellow-100'
    return 'text-gray-600 bg-gray-100'
  }

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center space-x-4">
        <Badge className={getRankColor(rank)}>
          #{rank}
        </Badge>
        
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
            <Trophy className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {elo.activityType?.name}
            </p>
            <p className="text-xs text-gray-500">
              {elo.gamesPlayed} games • Last played {elo.lastPlayed ? new Date(elo.lastPlayed).toLocaleDateString() : 'Never'}
            </p>
          </div>
        </div>
      </div>
      
      <div className="text-right">
        <Badge className={getRatingColor(elo.eloScore)}>
          {elo.eloScore}
        </Badge>
        {elo.recentChange && (
          <p className={`text-xs mt-1 ${
            elo.recentChange > 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {elo.recentChange > 0 ? '+' : ''}{elo.recentChange} recent
          </p>
        )}
      </div>
    </div>
  )
}

function ActivityPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
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
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-gray-100 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}