// packages/client/src/routes/notifications.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Bell, CheckCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export const Route = createFileRoute('/notifications')({
  component: Notifications,
})

function Notifications() {
  const { data: notificationsResponse } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(),
  })

  const notifications = notificationsResponse?.data || []

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Stay updated with your activities</CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length > 0 ? (
            <div className="space-y-4">
              {notifications.map((notification: any) => (
                <div key={notification.id} className="flex items-start gap-3 p-3 hover:bg-muted rounded">
                  <Bell className="h-5 w-5 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-muted-foreground">{notification.createdAt}</p>
                  </div>
                  {!notification.read && (
                    <CheckCircle className="h-5 w-5 text-primary cursor-pointer" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No notifications</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
