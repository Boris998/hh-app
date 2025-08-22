// packages/client/src/routes/skill-ratings.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/skill-ratings/')({
  component: SkillRatings,
})

function SkillRatings() {
  const { data: pendingRatingsResponse, isLoading } = useQuery({
    queryKey: ['pending-ratings'],
    queryFn: async () => {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      if (!user.id) return { data: { participants: [] } }
      return api.skillRatings.getActivityPending(user.id)
    },
  })

  const pendingRatings = pendingRatingsResponse?.data?.participants || []

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Skill Ratings</CardTitle>
          <CardDescription>Rate your teammates' performance</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRatings && pendingRatings.length > 0 ? (
            <div className="space-y-4">
              {pendingRatings.map((rating: any) => (
                <div key={rating.id} className="p-4 border rounded">
                  <p>Activity: {rating.activityName}</p>
                  <Button size="sm">Rate Players</Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No pending ratings</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}