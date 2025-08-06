// src/routes/activities/create.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  Calendar,
  MapPin,
  Users,
  Trophy,
  Clock,
  FileText,
  Loader2,
  ArrowLeft
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
import { api, queryKeys } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

interface ActivityFormData {
  activityTypeId: string
  description: string
  location: string
  dateTime: string
  maxParticipants: number | null
  eloLevel: number | null
  isELORated: boolean
}

export const Route = createFileRoute('/activities/create')({
  component: CreateActivityPage,
})

function CreateActivityPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [formData, setFormData] = useState<ActivityFormData>({
    activityTypeId: '',
    description: '',
    location: '',
    dateTime: '',
    maxParticipants: null,
    eloLevel: null,
    isELORated: true,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Fetch activity types
  const { data: activityTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: queryKeys.activityTypes(),
    queryFn: api.activityTypes.list,
  })

  // Create activity mutation
  const createActivityMutation = useMutation({
    mutationFn: api.activities.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      navigate({ to: `/activities/${data.id}` })
    },
    onError: (error: any) => {
      setErrors({ submit: error.message || 'Failed to create activity' })
    }
  })

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.activityTypeId) {
      newErrors.activityTypeId = 'Please select an activity type'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Please provide a description'
    }

    if (!formData.location.trim()) {
      newErrors.location = 'Please specify a location'
    }

    if (!formData.dateTime) {
      newErrors.dateTime = 'Please select date and time'
    } else {
      const selectedDate = new Date(formData.dateTime)
      if (selectedDate <= new Date()) {
        newErrors.dateTime = 'Activity must be scheduled for the future'
      }
    }

    if (formData.maxParticipants !== null && formData.maxParticipants < 2) {
      newErrors.maxParticipants = 'Minimum 2 participants required'
    }

    if (formData.isELORated && formData.eloLevel !== null) {
      if (formData.eloLevel < 800 || formData.eloLevel > 3000) {
        newErrors.eloLevel = 'ELO level must be between 800 and 3000'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    const submitData = {
      ...formData,
      maxParticipants: formData.maxParticipants || undefined,
      eloLevel: formData.isELORated ? formData.eloLevel || undefined : undefined,
    }

    createActivityMutation.mutate(submitData)
  }

  const handleInputChange = (field: keyof ActivityFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Get minimum date/time (current time + 1 hour)
  const getMinDateTime = () => {
    const now = new Date()
    now.setHours(now.getHours() + 1, 0, 0, 0)
    return now.toISOString().slice(0, 16)
  }

  if (!user) {
    return <div>Please log in to create activities.</div>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: '/activities' })}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Activities
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create Activity</h1>
        <p className="text-gray-600 mt-1">
          Organize a new activity and invite others to join
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Details</CardTitle>
          <CardDescription>
            Fill in the information about your activity
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">{errors.submit}</p>
              </div>
            )}

            {/* Activity Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Activity Type *
              </label>
              <Select
                value={formData.activityTypeId}
                onValueChange={(value) => handleInputChange('activityTypeId', value)}
                disabled={loadingTypes}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select activity type" />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.activityTypeId && (
                <p className="text-xs text-red-600">{errors.activityTypeId}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Description *
              </label>
              <Input
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="e.g., Casual basketball game at the local court"
                disabled={createActivityMutation.isPending}
              />
              {errors.description && (
                <p className="text-xs text-red-600">{errors.description}</p>
              )}
            </div>

            {/* Location */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                Location *
              </label>
              <Input
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="e.g., Central Park Basketball Court"
                disabled={createActivityMutation.isPending}
              />
              {errors.location && (
                <p className="text-xs text-red-600">{errors.location}</p>
              )}
            </div>

            {/* Date and Time */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                Date & Time *
              </label>
              <Input
                type="datetime-local"
                value={formData.dateTime}
                onChange={(e) => handleInputChange('dateTime', e.target.value)}
                min={getMinDateTime()}
                disabled={createActivityMutation.isPending}
              />
              {errors.dateTime && (
                <p className="text-xs text-red-600">{errors.dateTime}</p>
              )}
            </div>

            {/* Max Participants */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Maximum Participants
              </label>
              <Input
                type="number"
                value={formData.maxParticipants || ''}
                onChange={(e) => handleInputChange('maxParticipants', 
                  e.target.value ? parseInt(e.target.value) : null
                )}
                placeholder="Leave empty for unlimited"
                min={2}
                max={50}
                disabled={createActivityMutation.isPending}
              />
              {errors.maxParticipants && (
                <p className="text-xs text-red-600">{errors.maxParticipants}</p>
              )}
              <p className="text-xs text-gray-500">
                Including yourself. Leave empty for unlimited participants.
              </p>
            </div>

            {/* ELO Settings */}
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isELORated"
                  checked={formData.isELORated}
                  onChange={(e) => handleInputChange('isELORated', e.target.checked)}
                  className="rounded border-gray-300"
                  disabled={createActivityMutation.isPending}
                />
                <label htmlFor="isELORated" className="text-sm font-medium text-gray-700 flex items-center">
                  <Trophy className="h-4 w-4 mr-2" />
                  ELO Rated Activity
                </label>
              </div>

              {formData.isELORated && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Suggested ELO Level (optional)
                  </label>
                  <Input
                    type="number"
                    value={formData.eloLevel || ''}
                    onChange={(e) => handleInputChange('eloLevel', 
                      e.target.value ? parseInt(e.target.value) : null
                    )}
                    placeholder="e.g., 1200"
                    min={800}
                    max={3000}
                    disabled={createActivityMutation.isPending}
                  />
                  {errors.eloLevel && (
                    <p className="text-xs text-red-600">{errors.eloLevel}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Help players find activities matching their skill level. Leave empty to allow all levels.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-600">
                {formData.isELORated 
                  ? "This activity will affect players' ELO ratings based on results."
                  : "This will be a casual activity without ELO rating changes."
                }
              </p>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-4 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: '/activities' })}
                disabled={createActivityMutation.isPending}
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={createActivityMutation.isPending}
              >
                {createActivityMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Calendar className="mr-2 h-4 w-4" />
                    Create Activity
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tips Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tips for Creating Great Activities</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p>• <strong>Be specific</strong> in your description - mention skill level, equipment needed, etc.</p>
          <p>• <strong>Choose accessible locations</strong> that are easy to find and have parking/transport</p>
          <p>• <strong>Set realistic participant limits</strong> based on the venue and activity type</p>
          <p>• <strong>Use ELO ratings</strong> to help players find appropriately challenging activities</p>
          <p>• <strong>Schedule in advance</strong> to give people time to plan and join</p>
        </CardContent>
      </Card>
    </div>
  )
}