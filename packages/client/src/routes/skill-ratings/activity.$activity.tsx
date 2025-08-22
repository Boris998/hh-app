// packages/client/src/routes/skill-ratings/activity.$activityId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export const Route = createFileRoute('/skill-ratings/activity/$activity')({
  component: ActivitySkillRating,
})

function ActivitySkillRating() {
  const { activityId } = Route.useParams()
  
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Rate Players for Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Activity ID: {activityId}</p>
          {/* Add rating form here */}
        </CardContent>
      </Card>
    </div>
  )
}