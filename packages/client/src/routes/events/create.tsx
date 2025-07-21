// src/routes/events/create.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

export function CreateEvent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const createEventMutation = useMutation({
    mutationFn: async (eventData) => {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      })
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      navigate({ to: '/dashboard' })
    }
  })

  // Component implementation...
}