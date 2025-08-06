// src/routes/feed.tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Heart,
  MessageCircle,
  Share2,
  Trophy,
  Calendar,
  MapPin,
  Users,
  Plus,
  Activity,
  RefreshCw,
  Send
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/feed')({
  component: FeedPage,
})

function FeedPage() {
  const { user } = useAuthStore()
  
  // Fetch activity feed
  const { 
    data: feedData, 
    isLoading, 
    error,
    refetch,
    isRefetching 
  } = useQuery({
    queryKey: ['feed'],
    queryFn: () => api.feed.getActivityFeed(1, 20),
    refetchInterval: 60000,
  })

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Please log in to view your feed.</p>
      </div>
    )
  }

  const feedItems = feedData?.data || []

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <FeedHeader onRefresh={refetch} isRefetching={isRefetching} />
      
      {/* Create Post */}
      <CreatePostCard user={user} />

      {/* Feed Content */}
      <FeedContent 
        feedItems={feedItems}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        currentUser={user}
      />
    </div>
  )
}

function FeedHeader({ onRefresh, isRefetching }: {
  onRefresh: () => void
  isRefetching: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Activity Feed</h1>
        <p className="text-gray-600 mt-1">
          See what's happening in your sports community
        </p>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefetching}
        >
          <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
        </Button>
        
        <Link to="/activities/create">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Activity
          </Button>
        </Link>
      </div>
    </div>
  )
}

function CreatePostCard({ user }: { user: any }) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [postContent, setPostContent] = useState('')
  const queryClient = useQueryClient()

  const createPostMutation = useMutation({
    mutationFn: (content: string) => 
      api.feed.createPost('', { content }), // General post without specific activity
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setPostContent('')
      setShowCreateForm(false)
    }
  })

  const handleSubmit = () => {
    if (postContent.trim()) {
      createPostMutation.mutate(postContent)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start space-x-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatarUrl} />
            <AvatarFallback>
              {user.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            {!showCreateForm ? (
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="text-gray-600">Share your latest activity...</span>
              </button>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="What's happening with your training?"
                  className="resize-none min-h-[100px]"
                />
                
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Share your achievements, tips, or upcoming activities
                  </p>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowCreateForm(false)
                        setPostContent('')
                      }}
                    >
                      Cancel
                    </Button>
                    
                    <Button
                      size="sm"
                      disabled={!postContent.trim() || createPostMutation.isPending}
                      onClick={handleSubmit}
                    >
                      {createPostMutation.isPending ? (
                        <>
                          <Send className="h-4 w-4 mr-2 animate-pulse" />
                          Posting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Post
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FeedContent({ feedItems, isLoading, error, onRetry, currentUser }: {
  feedItems: any[]
  isLoading: boolean
  error: any
  onRetry: () => void
  currentUser: any
}) {
  if (isLoading) {
    return <FeedSkeleton />
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <Activity className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-red-600 mb-4">Failed to load activity feed</p>
        <Button onClick={onRetry}>Try Again</Button>
      </Card>
    )
  }

  if (feedItems.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Activity className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No activity yet
        </h3>
        <p className="text-gray-600 mb-4">
          Connect with friends and join activities to see updates here
        </p>
        <div className="flex items-center justify-center space-x-3">
          <Link to="/activities">
            <Button variant="outline">
              <Calendar className="h-4 w-4 mr-2" />
              Browse Activities
            </Button>
          </Link>
          <Link to="/profile/friends">
            <Button variant="outline">
              <Users className="h-4 w-4 mr-2" />
              Find Friends
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {feedItems.map((item) => (
        <FeedItem key={item.id} item={item} currentUser={currentUser} />
      ))}
      
      <div className="text-center">
        <Button variant="outline" className="w-full">
          Load More Activities
        </Button>
      </div>
    </div>
  )
}

function FeedItem({ item, currentUser }: { item: any; currentUser: any }) {
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [isLiked, setIsLiked] = useState(item.userHasLiked || false)
  const [likesCount, setLikesCount] = useState(item.likesCount || 0)
  const queryClient = useQueryClient()

  const likeMutation = useMutation({
    mutationFn: () => api.feed.likePost(item.id),
    onMutate: async () => {
      setIsLiked(!isLiked)
      setLikesCount((prev:number) => isLiked ? prev - 1 : prev + 1)
    },
    onError: () => {
      setIsLiked(isLiked)
      setLikesCount(likesCount)
    }
  })

  const commentMutation = useMutation({
    mutationFn: (comment: string) => api.feed.addComment(item.id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setNewComment('')
    }
  })

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    return date.toLocaleDateString()
  }

  const getUserInitials = (username: string) => {
    return username
      .split(' ')
      .map(name => name[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card>
      <CardContent className="p-6">
        {/* Post Header */}
        <div className="flex items-start space-x-4 mb-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={item.user?.avatarUrl} />
            <AvatarFallback>
              {getUserInitials(item.user?.username || 'User')}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="font-medium text-gray-900">
                {item.user?.username || 'Unknown User'}
              </span>
              
              {item.activity && (
                <>
                  <span className="text-gray-500">participated in</span>
                  <Link 
                    to={`/activities/${item.activity.id}`}
                    className="font-medium text-blue-600 hover:text-blue-500"
                  >
                    {item.activity.activityType?.name || 'Activity'}
                  </Link>
                </>
              )}
            </div>
            
            <p className="text-sm text-gray-500 mt-1">
              {formatTimeAgo(item.createdAt)}
            </p>
          </div>
        </div>

        {/* Post Content */}
        {item.content && (
          <div className="mb-4">
            <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">
              {item.content}
            </p>
          </div>
        )}

        {/* Activity Details */}
        {item.activity && (
          <ActivityDetailsCard activity={item.activity} />
        )}

        {/* ELO Changes */}
        {item.eloChanges && item.eloChanges.length > 0 && (
          <ELOChangesCard eloChanges={item.eloChanges} />
        )}

        {/* Post Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center space-x-6">
            <button
              onClick={() => likeMutation.mutate()}
              className={cn(
                "flex items-center space-x-2 text-sm transition-colors",
                isLiked ? "text-red-600" : "text-gray-500 hover:text-red-600"
              )}
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
              <span>{likesCount}</span>
            </button>
            
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center space-x-2 text-sm text-gray-500 hover:text-blue-600 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              <span>{item.commentsCount || 0}</span>
            </button>
            
            <button className="flex items-center space-x-2 text-sm text-gray-500 hover:text-green-600 transition-colors">
              <Share2 className="h-4 w-4" />
              <span>Share</span>
            </button>
          </div>
        </div>

        {/* Comments Section */}
        {showComments && (
          <CommentsSection 
            item={item}
            currentUser={currentUser}
            newComment={newComment}
            setNewComment={setNewComment}
            onSubmitComment={() => {
              if (newComment.trim()) {
                commentMutation.mutate(newComment)
              }
            }}
            isSubmitting={commentMutation.isPending}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ActivityDetailsCard({ activity }: { activity: any }) {
  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900">
          {activity.activityType?.name || 'Activity'}
        </h4>
        <Badge variant={activity.status === 'completed' ? 'default' : 'secondary'}>
          {activity.status || 'scheduled'}
        </Badge>
      </div>
      
      <div className="flex items-center space-x-4 text-sm text-gray-600 flex-wrap gap-2">
        {activity.dateTime && (
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-1" />
            {new Date(activity.dateTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </div>
        )}
        
        {activity.location && (
          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-1" />
            {activity.location}
          </div>
        )}
        
        {activity.participants && (
          <div className="flex items-center">
            <Users className="h-4 w-4 mr-1" />
            {activity.participants.length} participants
          </div>
        )}
      </div>
    </div>
  )
}

function ELOChangesCard({ eloChanges }: { eloChanges: any[] }) {
  return (
    <div className="mb-4 p-4 bg-blue-50 rounded-lg">
      <h4 className="font-medium text-blue-900 mb-2 flex items-center">
        <Trophy className="h-4 w-4 mr-2" />
        ELO Changes
      </h4>
      <div className="space-y-2">
        {eloChanges.map((change, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <span className="text-blue-800">{change.activityType}</span>
            <Badge 
              className={
                change.change > 0 
                  ? 'bg-green-100 text-green-800 border-green-200' 
                  : 'bg-red-100 text-red-800 border-red-200'
              }
            >
              {change.change > 0 ? '+' : ''}{change.change} ELO
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommentsSection({ 
  item, 
  currentUser, 
  newComment, 
  setNewComment, 
  onSubmitComment, 
  isSubmitting 
}: {
  item: any
  currentUser: any
  newComment: string
  setNewComment: (value: string) => void
  onSubmitComment: () => void
  isSubmitting: boolean
}) {
  return (
    <div className="mt-4 pt-4 border-t space-y-4">
      {/* Add Comment */}
      <div className="flex space-x-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={currentUser.avatarUrl} />
          <AvatarFallback className="text-xs">
            {currentUser.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 space-y-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmitComment()
              }
            }}
          />
          
          {newComment.trim() && (
            <div className="flex justify-end">
              <Button 
                size="sm" 
                onClick={onSubmitComment}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Posting...' : 'Comment'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Comments List */}
      {item.comments && item.comments.length > 0 && (
        <div className="space-y-3">
          {item.comments.map((comment: any) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  )
}

function CommentItem({ comment }: { comment: any }) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'now'
    if (diffInMinutes < 60) return `${diffInMinutes}m`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`
    return `${Math.floor(diffInMinutes / 1440)}d`
  }

  const getUserInitials = (username: string) => {
    return username
      .split(' ')
      .map(name => name[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="flex space-x-3">
      <Avatar className="h-6 w-6">
        <AvatarImage src={comment.user?.avatarUrl} />
        <AvatarFallback className="text-xs">
          {getUserInitials(comment.user?.username || 'User')}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 bg-gray-50 rounded-lg p-3">
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-sm font-medium text-gray-900">
            {comment.user?.username || 'Unknown User'}
          </span>
          <span className="text-xs text-gray-500">
            {formatTimeAgo(comment.createdAt)}
          </span>
        </div>
        <p className="text-sm text-gray-800">{comment.content}</p>
      </div>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-start space-x-4 mb-4">
              <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-2 mb-4">
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
            </div>
            
            <div className="h-16 bg-gray-100 rounded animate-pulse mb-4" />
            
            <div className="flex items-center space-x-6">
              <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}