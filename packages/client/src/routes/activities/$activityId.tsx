// packages/client/src/routes/activities/$activityId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, queryKeys } from '../../lib/api'
import { Loader2, MapPin, Calendar, Users, Trophy } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar'
import { useState } from 'react'
import { formatDate } from '../index'

export const Route = createFileRoute('/activities/$activityId')({
  component: ActivityDetail,
})

function ActivityDetail() {
  const { activityId } = Route.useParams()
  const queryClient = useQueryClient()
  const [showParticipants, setShowParticipants] = useState(false)
  
  const { data: activity, isLoading } = useQuery({
    queryKey: queryKeys.activity(activityId),
    queryFn: () => api.getActivity(activityId),
  })

  // Join activity mutation
  const joinMutation = useMutation({
    mutationFn: () => api.activities.join(activityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(activityId) })
    },
  })

  // Leave activity mutation
  const leaveMutation = useMutation({
    mutationFn: () => api.activities.leave(activityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(activityId) })
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!activity || !activity.data) {
    return <div>Activity not found</div>
  }

  const activityData = activity.data
  const canJoin = activityData.capabilities?.canJoin
  const canLeave = activityData.capabilities?.canLeave

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Activity Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{activityData.activityType?.name || 'Activity'}</CardTitle>
              <p className="text-gray-600 mt-2">{activityData.activity?.description}</p>
            </div>
            <Badge variant={activityData.activity?.completionStatus === 'completed' ? 'default' : 'secondary'}>
              {activityData.activity?.completionStatus || 'scheduled'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Activity Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Date & Time</p>
                <p className="font-medium">
                  {activityData.activity?.dateTime 
                    ? formatDate(activityData.activity.dateTime)
                    : 'No date specified'
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="font-medium">{activityData.activity?.location || 'No location specified'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Participants</p>
                <p className="font-medium">
                  {activityData.participants?.length || 0} / {activityData.activity?.maxParticipants || '∞'}
                </p>
              </div>
            </div>
          </div>

          {/* ELO Info */}
          {activityData.activity?.eloLevel && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <Trophy className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-blue-600 font-medium">ELO Rated Activity</p>
                <p className="text-sm text-gray-600">Recommended ELO: {activityData.activity.eloLevel}</p>
              </div>
            </div>
          )}

          {/* Creator Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Avatar>
              <AvatarImage src={activityData.creator?.avatarUrl} />
              <AvatarFallback>{activityData.creator?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-gray-500">Created by</p>
              <p className="font-medium">{activityData.creator?.username}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            {canJoin && (
              <Button 
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
                className="flex-1"
              >
                {joinMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Joining...</>
                ) : (
                  'Join Activity'
                )}
              </Button>
            )}
            
            {canLeave && (
              <Button 
                variant="outline"
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="flex-1"
              >
                {leaveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Leaving...</>
                ) : (
                  'Leave Activity'
                )}
              </Button>
            )}
            
            <Button 
              variant="outline" 
              onClick={() => setShowParticipants(!showParticipants)}
              className="flex-1"
            >
              {showParticipants ? 'Hide' : 'View'} Participants
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Participants List */}
      {showParticipants && activityData.participants && (
        <Card>
          <CardHeader>
            <CardTitle>Participants ({activityData.participants.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {activityData.participants.length > 0 ? (
              <div className="space-y-3">
                {activityData.participants.map((participant: any) => (
                  <div key={participant.user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={participant.user.avatarUrl} />
                        <AvatarFallback>{participant.user.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{participant.user.username}</p>
                        <p className="text-sm text-gray-500">
                          Joined {participant.participant.joinedAt ? formatDate(participant.participant.joinedAt) : 'recently'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {participant.participant.team && (
                        <Badge variant="outline">Team {participant.participant.team}</Badge>
                      )}
                      {participant.eloScore && (
                        <Badge variant="secondary">ELO {participant.eloScore}</Badge>
                      )}
                      <Badge 
                        variant={participant.participant.status === 'accepted' ? 'default' : 'secondary'}
                      >
                        {participant.participant.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">No participants yet</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}