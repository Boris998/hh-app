// src/components/profile/profile-header.tsx
import { useState } from 'react'
import { Camera, Edit, MapPin, Calendar, Trophy } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface ProfileHeaderProps {
  user: any
  profileData?: any
  isLoading?: boolean
}

export function ProfileHeader({ user, profileData, isLoading }: ProfileHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  
  const userInitials = user.username
    .split(' ')
    .map((name: string) => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const formatJoinDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })
  }

  if (isLoading) {
    return <ProfileHeaderSkeleton />
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user.avatarUrl} alt={user.username} />
              <AvatarFallback className="text-2xl font-bold bg-blue-100 text-blue-700">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            
            <Button
              size="sm"
              variant="outline"
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full p-0"
              onClick={() => setIsEditing(true)}
            >
              <Camera className="h-3 w-3" />
            </Button>
          </div>

          {/* User Info */}
          <div className="flex-1 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{user.username}</h1>
                <p className="text-gray-600 mt-1">{user.email}</p>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="mt-2 sm:mt-0"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center text-gray-600">
                <Calendar className="h-4 w-4 mr-2" />
                <span>Joined {formatJoinDate(user.createdAt)}</span>
              </div>
              
              {profileData?.location && (
                <div className="flex items-center text-gray-600">
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>{profileData.location}</span>
                </div>
              )}
              
              {profileData?.averageELO && (
                <div className="flex items-center text-gray-600">
                  <Trophy className="h-4 w-4 mr-2" />
                  <span>Avg ELO: {profileData.averageELO.toFixed(0)}</span>
                </div>
              )}
            </div>

            {/* Badges/Achievements */}
            <div className="flex flex-wrap gap-2">
              {profileData?.totalActivities > 10 && (
                <Badge variant="secondary">Active Player</Badge>
              )}
              
              {profileData?.friendsCount > 5 && (
                <Badge variant="secondary">Well Connected</Badge>
              )}
              
              {profileData?.highestELO > 1500 && (
                <Badge className="bg-purple-100 text-purple-800">ELO Master</Badge>
              )}
              
              {user.role === 'admin' && (
                <Badge variant="destructive">Admin</Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProfileHeaderSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="h-24 w-24 bg-gray-200 rounded-full animate-pulse" />
          
          <div className="flex-1 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mt-2" />
              </div>
              <div className="h-8 w-24 bg-gray-200 rounded animate-pulse mt-2 sm:mt-0" />
            </div>
            
            <div className="flex flex-wrap gap-6">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}