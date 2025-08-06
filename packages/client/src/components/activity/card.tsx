// src/components/activity/card.tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '../ui/button'
import { format } from 'path'

export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{activity.name}</h3>
          <p className="text-sm text-muted-foreground">
            {format(activity.date)}
          </p>
        </div>
        <Badge variant="outline">{activity.type}</Badge>
      </div>
      
      <div className="mt-4 flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={activity.creator.avatarUrl} />
          <AvatarFallback>{activity.creator.name[0]}</AvatarFallback>
        </Avatar>
        <span className="text-sm text-muted-foreground">
          Organized by {activity.creator.name}
        </span>
      </div>
      
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm">
          View Details
        </Button>
        <Button size="sm">Join Activity</Button>
      </div>
    </div>
  )
}