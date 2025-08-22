// src/routes/activities/create.tsx - Updated with react-hook-form
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { 
  ArrowLeft, 
  CalendarIcon, 
  MapPin, 
  Users, 
  Trophy,
  Info,
  Zap
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { api, queryKeys } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/activities/create')({
  component: CreateActivityPage,
})

const createActivitySchema = z.object({
  activityTypeId: z.string().min(1, 'Activity type is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  location: z.string().optional(),
  dateTime: z.string().min(1, 'Date and time is required'),
  maxParticipants: z.number().min(2, 'Must allow at least 2 participants').optional(),
  eloLevel: z.number().min(800).max(2400).optional(),
  isELORated: z.boolean(),
})

type CreateActivityForm = z.infer<typeof createActivitySchema>

function CreateActivityPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [selectedActivityType, setSelectedActivityType] = useState<any>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateActivityForm>({
  resolver: zodResolver(createActivitySchema),
  defaultValues: {
    activityTypeId: '',
    description: '',
    dateTime: '',
    isELORated: false, // Add default value
    location: '',
    maxParticipants: undefined,
    eloLevel: undefined,
  },
})

  const watchActivityTypeId = watch('activityTypeId')
  const watchIsELORated = watch('isELORated')

  // Fetch activity types
  const { data: activityTypesData } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: () => api.activityTypes.list(),
  })

  // Fetch user's ELO for suggestion
  const { data: userELOData } = useQuery({
    queryKey: queryKeys.userELO(user?.id || ''),
    queryFn: () => api.users.getELO(user?.id || ''),
    enabled: !!user?.id && !!watchActivityTypeId,
  })

  // Create activity mutation
  const createActivityMutation = useMutation({
    mutationFn: (data: CreateActivityForm) => api.activities.create(data),
    onSuccess: (response) => {
      toast.success('Activity created successfully!')
      queryClient.invalidateQueries({ queryKey: queryKeys.activities() })
      router.navigate({ to: `/activities/${response.data.activity.id}` })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create activity')
    },
  })

  const activityTypes = activityTypesData?.data?.activityTypes || []
  const userELOs = userELOData?.data || []

  // Get user's ELO for selected activity type
  const getUserELOForType = (activityTypeId: string) => {
    const userELO = userELOs.find(elo => elo.activityTypeId === activityTypeId)
    return userELO?.eloScore || 1200
  }

  // Auto-suggest ELO level based on user's rating
  const suggestELOLevel = (activityTypeId: string) => {
    const userELO = getUserELOForType(activityTypeId)
    setValue('eloLevel', userELO)
  }

  const onSubmit = async (data: CreateActivityForm) => {
    try {
      await createActivityMutation.mutateAsync(data)
    } catch (error) {
      // Error handled in mutation
    }
  }

  const handleActivityTypeChange = (activityTypeId: string) => {
    setValue('activityTypeId', activityTypeId)
    const selected = activityTypes.find(type => type.id === activityTypeId)
    setSelectedActivityType(selected)
    
    // Auto-suggest ELO if ELO rated
    if (watchIsELORated) {
      suggestELOLevel(activityTypeId)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.history.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create Activity</h1>
          <p className="text-gray-600 mt-1">
            Start a new activity and invite others to join
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Activity Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Type</CardTitle>
            <CardDescription>
              Choose the type of activity you want to organize
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Select onValueChange={handleActivityTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an activity type" />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center space-x-2">
                        <span>{type.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {type.category?.replace('_', ' ')}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.activityTypeId && (
                <p className="text-sm text-red-600 mt-1">{errors.activityTypeId.message}</p>
              )}
            </div>

            {/* Activity Type Info */}
            {selectedActivityType && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">{selectedActivityType.name}</h4>
                <p className="text-sm text-blue-700 mb-3">{selectedActivityType.description}</p>
                
                {/* Show if solo performable */}
                {selectedActivityType.isSoloPerformable && (
                  <Badge variant="secondary" className="text-xs">
                    <Info className="h-3 w-3 mr-1" />
                    Can be performed solo
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Basic Details */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Details</CardTitle>
            <CardDescription>
              Provide details about your activity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe your activity, skill level, what to bring, etc."
                rows={4}
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-red-600 mt-1">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="location">Location</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="location"
                    placeholder="Enter location or address"
                    className="pl-10"
                    {...register('location')}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="dateTime">Date & Time *</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="dateTime"
                    type="datetime-local"
                    className="pl-10"
                    min={new Date().toISOString().slice(0, 16)}
                    {...register('dateTime')}
                  />
                </div>
                {errors.dateTime && (
                  <p className="text-sm text-red-600 mt-1">{errors.dateTime.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="maxParticipants">Maximum Participants</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="maxParticipants"
                  type="number"
                  placeholder="Leave empty for unlimited"
                  className="pl-10"
                  min={2}
                  max={100}
                  {...register('maxParticipants', { valueAsNumber: true })}
                />
              </div>
              {errors.maxParticipants && (
                <p className="text-sm text-red-600 mt-1">{errors.maxParticipants.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ELO Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Competition Settings</CardTitle>
            <CardDescription>
              Configure competitive aspects of your activity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isELORated">ELO Rated Activity</Label>
                <p className="text-sm text-gray-600">
                  This activity will affect participants' ELO ratings
                </p>
              </div>
              <Switch
                id="isELORated"
                checked={watchIsELORated}
                onCheckedChange={(checked) => setValue('isELORated', checked)}
              />
            </div>

            {watchIsELORated && (
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label htmlFor="eloLevel">Suggested ELO Level</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <div className="relative flex-1">
                      <Trophy className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="eloLevel"
                        type="number"
                        placeholder="1200"
                        className="pl-10"
                        min={800}
                        max={2400}
                        {...register('eloLevel', { valueAsNumber: true })}
                      />
                    </div>
                    {watchActivityTypeId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => suggestELOLevel(watchActivityTypeId)}
                      >
                        <Zap className="h-4 w-4 mr-1" />
                        Use My ELO ({getUserELOForType(watchActivityTypeId)})
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Participants with similar ELO levels will have the best experience
                  </p>
                  {errors.eloLevel && (
                    <p className="text-sm text-red-600 mt-1">{errors.eloLevel.message}</p>
                  )}
                </div>

                {watchActivityTypeId && userELOs.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Your ELO Ratings</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {userELOs
                        .filter(elo => elo.activityTypeId === watchActivityTypeId)
                        .map(elo => (
                          <div key={elo.activityTypeId} className="text-sm">
                            <span className="font-medium">{elo.eloScore}</span>
                            <span className="text-gray-600 ml-1">
                              ({elo.gamesPlayed} games)
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.history.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || createActivityMutation.isPending}
            className="min-w-[120px]"
          >
            {isSubmitting || createActivityMutation.isPending ? 'Creating...' : 'Create Activity'}
          </Button>
        </div>
      </form>
    </div>
  )
}