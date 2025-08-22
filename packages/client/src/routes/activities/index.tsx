// src/routes/activities/index.tsx - Updated with enhanced backend features
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { 
  Plus, 
  Filter, 
  Search, 
  MapPin, 
  Calendar, 
  Users, 
  Trophy,
  Clock,
  ChevronDown,
  SlidersHorizontal
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { api, queryKeys } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn} from '@/lib/utils'
import { formatDate } from '..'

export const Route = createFileRoute('/activities/')({
  component: ActivitiesPage,
})

interface ActivityFilters {
  activityType?: string
  location?: string
  dateFrom?: string
  dateTo?: string
  status?: 'scheduled' | 'active' | 'completed' | 'cancelled'
  eloRange?: [number, number]
  page: number
  limit: number
}

function ActivitiesPage() {
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<ActivityFilters>({
    page: 1,
    limit: 12,
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Fetch activity types for filtering
  const { data: activityTypesData, isLoading: loadingTypes } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: () => api.activityTypes.list(),
  })

  // Fetch activities with filters
const { 
  data: activitiesData, 
  isLoading: loadingActivities,
  error: activitiesError,
  refetch: refetchActivities 
} = useQuery({
  queryKey: queryKeys.activities(filters),
  queryFn: () => api.activities.list({
    ...filters,
    ...(searchQuery && { search: searchQuery }),
  }),
  placeholderData: (previousData) => previousData, // Replace keepPreviousData
})

  // Fetch user's ELO for context
  const { data: userELOData } = useQuery({
    queryKey: queryKeys.userELO(user?.id || ''),
    queryFn: () => api.users.getELO(user?.id || ''),
    enabled: !!user?.id,
  })

  const activities = activitiesData?.data?.activities || []
  const pagination = activitiesData?.data?.pagination
  const activityTypes = activityTypesData?.data?.activityTypes || []
  const userELOs = userELOData?.data || []

  const updateFilters = (newFilters: Partial<ActivityFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      page: 1, // Reset to first page when filters change
    }))
  }

  const clearFilters = () => {
    setFilters({ page: 1, limit: 12 })
    setSearchQuery('')
  }

  const getActivityTypeIcon = (activityType: any) => {
    // You can map activity types to specific icons here
    return Trophy
  }

  const getStatusColor = (status: string) => {
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

  const getUserELOForActivity = (activityTypeId: string) => {
    const userELO = userELOs.find(elo => elo.activityTypeId === activityTypeId)
    return userELO?.eloScore || 1200
  }

  const isELOMatch = (activity: any) => {
    const eloLevel = activity.activity?.eloLevel || activity.eloLevel
    if (!eloLevel) return true
    const activityTypeId = activity.activity?.activityTypeId || activity.activityTypeId
    const userELO = getUserELOForActivity(activityTypeId)
    const range = 200 // ±200 ELO range
    return Math.abs(userELO - eloLevel) <= range
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Activities</h1>
          <p className="text-gray-600 mt-1">
            Discover and join activities in your area
          </p>
        </div>
        <Link to="/activities/create">
          <Button size="lg" className="mt-4 sm:mt-0">
            <Plus className="h-5 w-5 mr-2" />
            Create Activity
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search activities, locations, or descriptions..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <Select 
                value={filters.activityType || 'all'} 
                onValueChange={(value) => updateFilters({ activityType: value === 'all' ? undefined : value })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Activity Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Array.isArray(activityTypes) && activityTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select 
                value={filters.status || 'all-status'} 
                onValueChange={(value) => updateFilters({ status: value === 'all-status' ? undefined : value as any })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-status">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="ml-auto"
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filters
                <ChevronDown className={cn(
                  "h-4 w-4 ml-2 transition-transform",
                  showAdvancedFilters && "rotate-180"
                )} />
              </Button>

              {(filters.activityType || filters.status || filters.location) && (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Advanced Filters */}
            {showAdvancedFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <label className="text-sm font-medium mb-2 block">Location</label>
                  <Input
                    placeholder="Enter location"
                    value={filters.location || ''}
                    onChange={(e) => updateFilters({ location: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Date From</label>
                  <Input
                    type="datetime-local"
                    value={filters.dateFrom || ''}
                    onChange={(e) => updateFilters({ dateFrom: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Date To</label>
                  <Input
                    type="datetime-local"
                    value={filters.dateTo || ''}
                    onChange={(e) => updateFilters({ dateTo: e.target.value || undefined })}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loadingActivities ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : activitiesError ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600">Failed to load activities. Please try again.</p>
            <Button onClick={() => refetchActivities()} className="mt-2">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No activities found</h3>
            <p className="text-gray-600 mb-4">
              {Object.keys(filters).length > 2 || searchQuery
                ? "Try adjusting your filters or search terms"
                : "Be the first to create an activity in your area"
              }
            </p>
            <Link to="/activities/create">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Activity
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Found {pagination?.total || 0} activities
            </p>
            <Select value={String(filters.limit)} onValueChange={(value) => updateFilters({ limit: Number(value) })}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 per page</SelectItem>
                <SelectItem value="12">12 per page</SelectItem>
                <SelectItem value="24">24 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Activity Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activities.map((activity: any, index: number) => {
              const activityTypeId = activity.activity?.activityTypeId || activity.activityTypeId
              const activityType = activityTypes.find(type => type.id === activityTypeId) || activity.activityType
              const IconComponent = getActivityTypeIcon(activityType)
              const userELO = getUserELOForActivity(activityTypeId)
              const isGoodMatch = isELOMatch(activity)
              const uniqueKey = (activity.activity?.id || activity.id) ? `${activity.activity?.id || activity.id}-activity-${index}` : `activity-${index}`;

              return (
                <Link key={uniqueKey} to="/activities/$activityId" params={{activityId: activity.activity?.id || activity.id}}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <IconComponent className="h-5 w-5 text-blue-600" />
                          <CardTitle className="text-lg">{activity.activityType?.name || activityType?.name}</CardTitle>
                        </div>
                        <Badge className={getStatusColor(activity.activity?.completionStatus || activity.completionStatus)}>
                          {activity.activity?.completionStatus || activity.completionStatus}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {activity.activity?.description || activity.description}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      {/* Location and Time */}
                      <div className="space-y-2">
                        {(activity.activity?.location || activity.location) && (
                          <div className="flex items-center text-sm text-gray-600">
                            <MapPin className="h-4 w-4 mr-2" />
                            {activity.activity?.location || activity.location}
                          </div>
                        )}
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-4 w-4 mr-2" />
                          {formatDate(activity.activity?.dateTime || activity.dateTime)}
                        </div>
                      </div>

                      {/* Participants and ELO */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-sm text-gray-600">
                          <Users className="h-4 w-4 mr-1" />
                          {activity.participantCount || 0}
                          {(activity.activity?.maxParticipants || activity.maxParticipants) && `/${activity.activity?.maxParticipants || activity.maxParticipants}`}
                        </div>
                        
                        {(activity.activity?.eloLevel || activity.eloLevel) && (
                          <div className="flex items-center space-x-2">
                            <Badge variant={isGoodMatch ? "default" : "secondary"}>
                              ELO {activity.activity?.eloLevel || activity.eloLevel}
                            </Badge>
                            {!isGoodMatch && (
                              <span className="text-xs text-gray-500">
                                (Your: {userELO})
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Creator */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium">
                              {activity.creator?.username?.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm text-gray-600">
                            {activity.creator?.username}
                          </span>
                        </div>
                        
                        {(activity.activity?.createdAt || activity.createdAt) && (
                          <span className="text-xs text-gray-500">
                            Created {formatDate(activity.activity?.createdAt || activity.createdAt)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center space-x-2">
              <Button
                variant="outline"
                onClick={() => updateFilters({ page: filters.page - 1 })}
                disabled={filters.page <= 1}
              >
                Previous
              </Button>
              
              <div className="flex items-center space-x-1">
                {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
                  const pageNum = i + 1
                  const isCurrentPage = pageNum === filters.page
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={isCurrentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateFilters({ page: pageNum })}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>
              
              <Button
                variant="outline"
                onClick={() => updateFilters({ page: filters.page + 1 })}
                disabled={filters.page >= pagination.pages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}