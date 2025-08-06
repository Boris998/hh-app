// src/routes/activities/index.tsx
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { 
  Calendar,
  MapPin,
  Users,
  Filter,
  Search,
  Plus,
  Clock,
  Trophy,
  ChevronDown
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, queryKeys } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
// Using basic date formatting instead of date-fns
const formatDateTime = (date: Date | string) => {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}
import { cn } from '@/lib/utils'

interface ActivityFilters {
  search?: string
  activityType?: string
  location?: string
  dateFilter?: 'all' | 'today' | 'week' | 'month'
  eloRange?: 'all' | 'beginner' | 'intermediate' | 'advanced'
  availability?: 'all' | 'available' | 'full'
}

export const Route = createFileRoute('/activities/')({
  component: ActivitiesPage,
  validateSearch: (search): ActivityFilters => ({
    search: search.search as string,
    activityType: search.activityType as string,
    location: search.location as string,
    dateFilter: (search.dateFilter as ActivityFilters['dateFilter']) || 'all',
    eloRange: (search.eloRange as ActivityFilters['eloRange']) || 'all',
    availability: (search.availability as ActivityFilters['availability']) || 'all',
  }),
})

function ActivitiesPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const filters = Route.useSearch()
  
  const [page, setPage] = useState(1)
  const limit = 12

  // Fetch activity types for filter dropdown
  const { data: activityTypes = [] } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: api.activityTypes.list,
  })

  // Fetch activities with filters
  const { 
    data: activitiesData, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['activities', { ...filters, page, limit }],
    queryFn: () => api.activities.list({
      page,
      limit,
      ...(filters.search && { search: filters.search }),
      ...(filters.activityType && { activityType: filters.activityType }),
      ...(filters.location && { location: filters.location }),
      ...getDateFilters(filters.dateFilter),
      ...getELOFilters(filters.eloRange),
    }),
  })

  const activities = activitiesData?.data || []
  const pagination = activitiesData?.pagination

  const updateFilters = (newFilters: Partial<ActivityFilters>) => {
    navigate({
      to: '/activities',
      search: { ...filters, ...newFilters },
    })
    setPage(1) // Reset to first page when filters change
  }

  if (!user) {
    return <div>Please log in to view activities.</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Activities</h1>
          <p className="text-gray-600 mt-1">
            Find and join activities in your area
          </p>
        </div>
        
        <Link to="/activities/create">
          <Button className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>Create Activity</span>
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search activities..."
                  value={filters.search || ''}
                  onChange={(e:any) => updateFilters({ search: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Activity Type Filter */}
            <Select
              value={filters.activityType || 'all'}
              onValueChange={(value:any) => 
                updateFilters({ activityType: value === 'all' ? undefined : value })
              }
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

            {/* Date Filter */}
            <Select
              value={filters.dateFilter || 'all'}
              onValueChange={(value:any) => 
                updateFilters({ dateFilter: value as ActivityFilters['dateFilter'] })
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>

            {/* ELO Range Filter */}
            <Select
              value={filters.eloRange || 'all'}
              onValueChange={(value:any) => 
                updateFilters({ eloRange: value as ActivityFilters['eloRange'] })
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Skill Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>

            {/* More Filters */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center space-x-2">
                  <Filter className="h-4 w-4" />
                  <span>More</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => updateFilters({ availability: 'available' })}
                >
                  Available Only
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => updateFilters({ availability: 'all' })}
                >
                  Show All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Active filters display */}
          {hasActiveFilters(filters) && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex flex-wrap gap-2">
                {filters.search && (
                  <FilterBadge
                    label={`Search: ${filters.search}`}
                    onRemove={() => updateFilters({ search: undefined })}
                  />
                )}
                {filters.activityType && (
                  <FilterBadge
                    label={`Type: ${activityTypes.find(t => t.id === filters.activityType)?.name}`}
                    onRemove={() => updateFilters({ activityType: undefined })}
                  />
                )}
                {filters.dateFilter && filters.dateFilter !== 'all' && (
                  <FilterBadge
                    label={`Date: ${filters.dateFilter}`}
                    onRemove={() => updateFilters({ dateFilter: 'all' })}
                  />
                )}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: '/activities', search: {} })}
              >
                Clear All
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading/Error/Empty States */}
      {isLoading && <ActivitiesSkeletonGrid />}
      
      {error && (
        <Card className="p-8 text-center">
          <p className="text-red-600 mb-4">Failed to load activities</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Card>
      )}

      {!isLoading && !error && activities.length === 0 && (
        <Card className="p-8 text-center">
          <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No activities found
          </h3>
          <p className="text-gray-600 mb-4">
            Try adjusting your filters or create a new activity
          </p>
          <Link to="/activities/create">
            <Button>Create Activity</Button>
          </Link>
        </Card>
      )}

      {/* Activities Grid */}
      {!isLoading && !error && activities.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex justify-center items-center space-x-2">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              
              <span className="text-sm text-gray-600">
                Page {page} of {pagination.pages}
              </span>
              
              <Button
                variant="outline"
                disabled={page === pagination.pages}
                onClick={() => setPage(page + 1)}
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

function ActivityCard({ activity }: { activity: any }) {
  const { user } = useAuthStore()
  
  const isParticipant = activity.participants?.some(
    (p: any) => p.userId === user?.id
  )
  
  const isFull = activity.maxParticipants && 
    activity.participants?.length >= activity.maxParticipants
  
  const canJoin = !isParticipant && !isFull && 
    new Date(activity.dateTime) > new Date()

  return (
    <Card className="group hover:shadow-lg transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={activity.creator?.avatarUrl} />
              <AvatarFallback>
                {activity.creator?.username?.[0]?.toUpperCase() || 'A'}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <CardTitle className="text-lg leading-tight">
                {activity.activityType?.name}
              </CardTitle>
              <p className="text-sm text-gray-600">
                by {activity.creator?.username}
              </p>
            </div>
          </div>
          
          <Badge 
            variant={isParticipant ? "default" : "outline"}
            className="text-xs"
          >
            {isParticipant ? "Joined" : activity.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {activity.description && (
          <p className="text-sm text-gray-700 line-clamp-2">
            {activity.description}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="h-4 w-4 mr-2" />
            {formatDateTime(activity.dateTime)}
          </div>
          
          {activity.location && (
            <div className="flex items-center text-sm text-gray-600">
              <MapPin className="h-4 w-4 mr-2" />
              {activity.location}
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm text-gray-600">
              <Users className="h-4 w-4 mr-2" />
              {activity.participants?.length || 0}
              {activity.maxParticipants && ` / ${activity.maxParticipants}`}
            </div>
            
            {activity.eloLevel && (
              <div className="flex items-center text-sm text-gray-600">
                <Trophy className="h-4 w-4 mr-1" />
                {activity.eloLevel} ELO
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Link to={`/activities/${activity.id}`}>
            <Button variant="outline" size="sm">
              View Details
            </Button>
          </Link>
          
          {canJoin && (
            <JoinActivityButton activityId={activity.id} />
          )}
          
          {isFull && !isParticipant && (
            <Badge variant="secondary" className="text-xs">
              Full
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function JoinActivityButton({ activityId }: { activityId: string }) {
  const [isLoading, setIsLoading] = useState(false)

  const handleJoin = async () => {
    setIsLoading(true)
    try {
      await api.activities.join(activityId)
      // Refresh the activities list
      window.location.reload()
    } catch (error) {
      console.error('Failed to join activity:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      onClick={handleJoin}
      disabled={isLoading}
    >
      {isLoading ? 'Joining...' : 'Join'}
    </Button>
  )
}

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge
      variant="secondary"
      className="cursor-pointer hover:bg-gray-200 transition-colors"
      onClick={onRemove}
    >
      {label} ×
    </Badge>
  )
}

function ActivitiesSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-gray-200 rounded-full" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-200 rounded" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-4 w-full bg-gray-200 rounded" />
            <div className="h-4 w-2/3 bg-gray-200 rounded" />
            <div className="space-y-2">
              <div className="h-3 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-200 rounded" />
            </div>
            <div className="flex justify-between pt-2">
              <div className="h-8 w-24 bg-gray-200 rounded" />
              <div className="h-8 w-16 bg-gray-200 rounded" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Helper functions
function getDateFilters(dateFilter?: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  switch (dateFilter) {
    case 'today':
      return {
        dateFrom: today.toISOString(),
        dateTo: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }
    case 'week':
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)
      return {
        dateFrom: weekStart.toISOString(),
        dateTo: weekEnd.toISOString(),
      }
    case 'month':
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return {
        dateFrom: monthStart.toISOString(),
        dateTo: monthEnd.toISOString(),
      }
    default:
      return {}
  }
}

function getELOFilters(eloRange?: string) {
  switch (eloRange) {
    case 'beginner':
      return { eloRange: [0, 1200] }
    case 'intermediate':
      return { eloRange: [1200, 1600] }
    case 'advanced':
      return { eloRange: [1600, 3000] }
    default:
      return {}
  }
}

function hasActiveFilters(filters: ActivityFilters): boolean {
  return !!(
    filters.search ||
    filters.activityType ||
    filters.location ||
    (filters.dateFilter && filters.dateFilter !== 'all') ||
    (filters.eloRange && filters.eloRange !== 'all') ||
    (filters.availability && filters.availability !== 'all')
  )
}