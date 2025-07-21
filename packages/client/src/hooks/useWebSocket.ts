// src/hooks/useWebSocket.ts
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    wsRef.current = new WebSocket(url)
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      // Update relevant queries based on message type
      switch (data.type) {
        case 'EVENT_UPDATE':
          queryClient.invalidateQueries({ queryKey: ['events'] })
          break
        case 'CHAT_MESSAGE':
          queryClient.setQueryData(['chat', data.eventId], (old: any) => {
            return [...(old || []), data.message]
          })
          break
      }
    }

    return () => {
      wsRef.current?.close()
    }
  }, [url, queryClient])

  const send = (data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }

  return { send }
}