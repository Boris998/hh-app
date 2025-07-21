//src/lib/api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export class ApiError extends Error {
  public status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(response.status, errorData.message || 'Request failed')
  }

  return response.json()
}

// src/lib/websocket.ts
import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type WebSocketMessage = {
  type: string
  data: any
  eventId?: string
}

export function useWebSocket(url?: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  const wsUrl = url || `${import.meta.env.VITE_WS_URL || 'ws://localhost:3001'}/ws`

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        reconnectAttemptsRef.current = 0
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          
          switch (message.type) {
            case 'EVENT_CREATED':
            case 'EVENT_UPDATED':
            case 'EVENT_DELETED':
              queryClient.invalidateQueries({ queryKey: ['events'] })
              break
              
            case 'CHAT_MESSAGE':
              if (message.eventId) {
                queryClient.setQueryData(['chat', message.eventId], (old: any[]) => [
                  ...(old || []),
                  message.data
                ])
              }
              break
              
            case 'USER_JOINED':
            case 'USER_LEFT':
              if (message.eventId) {
                queryClient.invalidateQueries({ 
                  queryKey: ['event', message.eventId, 'participants'] 
                })
              }
              break
              
            default:
              console.log('Unhandled WebSocket message:', message)
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected')
        
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const timeout = Math.pow(2, reconnectAttemptsRef.current) * 1000
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++
            connect()
          }, timeout)
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
    }
  }, [wsUrl, queryClient])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    wsRef.current?.close()
  }, [])

  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, message not sent:', message)
    }
  }, [])

  useEffect(() => {
    connect()
    return disconnect
  }, [connect, disconnect])

  return { send, disconnect }
}