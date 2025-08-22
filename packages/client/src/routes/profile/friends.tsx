// packages/client/src/routes/profile/friends.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { UserPlus, Users } from 'lucide-react'
import { Button } from '../../components/ui/button'

export const Route = createFileRoute('/profile/friends')({
  component: Friends,
})

function Friends() {
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Friends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Your Friends</h3>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Friend
              </Button>
            </div>
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No friends yet</p>
              <p className="text-sm">Connect with other players to see their activities</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}