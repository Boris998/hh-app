// src/stores/delta-store.ts
import { create } from 'zustand'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './auth-store'

export interface DeltaUpdate {
  entityType: 'activity' | 'elo' | 'skill' | 'social' | 'invitation'
  entityId: string
  changeType: 'created' | 'updated' | 'deleted'
  data: any
  timestamp: string
  userId?: string
}

export interface DeltaState {
  // State
  lastSync: string | null
  pendingUpdates: DeltaUpdate[]
  connectionStatus: 'connected' | 'disconnected' | 'polling' | 'error'
  isPolling: boolean
  pollInterval: number
  retryCount: number
  
  // Actions
  setLastSync: (timestamp: string) => void
  addPendingUpdate: (update: DeltaUpdate) => void
  clearPendingUpdates: () => void
  setConnectionStatus: (status: DeltaState['connectionStatus']) => void
  setIsPolling: (polling: boolean) => void
  setPollInterval: (interval: number) => void
  incrementRetryCount: () => void
  resetRetryCount: () => void
}

export const useDeltaStore = create<DeltaState>((set) => ({
  // Initial state
  lastSync: null,
  pendingUpdates: [],
  connectionStatus: 'disconnected',
  isPolling: false,
  pollInterval: 5000, // 5 seconds default
  retryCount: 0,

  // Actions
  setLastSync: (timestamp: string) => set({ lastSync: timestamp }),
  
  addPendingUpdate: (update: DeltaUpdate) => 
    set((state) => ({
      pendingUpdates: [...state.pendingUpdates, update]
    })),
  
  clearPendingUpdates: () => set({ pendingUpdates: [] }),
  
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  
  setIsPolling: (isPolling) => set({ isPolling }),
  
  setPollInterval: (pollInterval) => set({ pollInterval }),
  
  incrementRetryCount: () => set((state) => ({
    retryCount: state.retryCount + 1
  })),
  
  resetRetryCount: () => set({ retryCount: 0 }),
}))

// Delta polling hook
export const useDeltaPolling = () => {
  const queryClient = useQueryClient()
  const { user, token, isAuthenticated } = useAuthStore()
  const {
    lastSync,
    connectionStatus,
    isPolling,
    pollInterval,
    retryCount,
    setLastSync,
    addPendingUpdate,
    setConnectionStatus,
    setIsPolling,
    incrementRetryCount,
    resetRetryCount,
  } = useDeltaStore()

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchDeltas = async (): Promise<DeltaUpdate[]> => {
    if (!isAuthenticated || !token) {
      throw new Error('Not authenticated')
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    const response = await fetch(
      `/api/deltas?since=${lastSync || ''}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal,
      }
    )

    if (!response.ok) {
      throw new Error(`Delta fetch failed: ${response.status}`)
    }

    const data = await response.json()
    return data.deltas || []
  }

  const applyDeltas = (deltas: DeltaUpdate[]) => {
    deltas.forEach((delta) => {
      // Add to pending updates for debugging
      addPendingUpdate(delta)

      // Invalidate relevant queries based on entity type
      switch (delta.entityType) {
        case 'activity':
          queryClient.invalidateQueries({ queryKey: ['activities'] })
          queryClient.invalidateQueries({ 
            queryKey: ['activities', delta.entityId] 
          })
          break

        case 'elo':
          queryClient.invalidateQueries({ queryKey: ['elo'] })
          queryClient.invalidateQueries({ queryKey: ['leaderboards'] })
          if (delta.userId) {
            queryClient.invalidateQueries({ 
              queryKey: ['elo', delta.userId] 
            })
          }
          break

        case 'skill':
          queryClient.invalidateQueries({ queryKey: ['skills'] })
          if (delta.userId) {
            queryClient.invalidateQueries({ 
              queryKey: ['skills', delta.userId] 
            })
          }
          break

        case 'social':
          queryClient.invalidateQueries({ queryKey: ['friends'] })
          queryClient.invalidateQueries({ queryKey: ['feed'] })
          break

        case 'invitation':
          queryClient.invalidateQueries({ queryKey: ['invitations'] })
          queryClient.invalidateQueries({ queryKey: ['activities'] })
          break
      }
    })

    // Update last sync timestamp
    if (deltas.length > 0) {
      const latestTimestamp = deltas
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        [0]?.timestamp

      if (latestTimestamp) {
        setLastSync(latestTimestamp)
      }
    }
  }

  const poll = async () => {
    if (!isAuthenticated || isPolling) {
      return
    }

    setIsPolling(true)
    setConnectionStatus('polling')

    try {
      const deltas = await fetchDeltas()
      
      if (deltas.length > 0) {
        applyDeltas(deltas)
      }

      setConnectionStatus('connected')
      resetRetryCount()
      
    } catch (error:any) {
      console.error('Delta polling error:', error)
      
      // Handle different error types
      if (error.name === 'AbortError') {
        // Request was cancelled, not a real error
        return
      }

      incrementRetryCount()
      setConnectionStatus('error')

      // Exponential backoff for retries
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000)
      
      setTimeout(() => {
        if (retryCount < 5) { // Max 5 retries
          poll()
        }
      }, backoffDelay)
      
    } finally {
      setIsPolling(false)
    }
  }

  // Start/stop polling based on auth status
  useEffect(() => {
    if (isAuthenticated && user) {
      setConnectionStatus('connected')
      
      // Initial poll
      poll()
      
      // Set up interval
      intervalRef.current = setInterval(poll, pollInterval)
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
      }
    } else {
      setConnectionStatus('disconnected')
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isAuthenticated, user, pollInterval])

  // Adaptive polling interval based on connection status and activity
  useEffect(() => {
    if (connectionStatus === 'error' && retryCount > 2) {
      // Slow down polling when there are errors
      useDeltaStore.getState().setPollInterval(15000) // 15 seconds
    } else if (connectionStatus === 'connected') {
      // Normal polling
      useDeltaStore.getState().setPollInterval(5000) // 5 seconds
    }
  }, [connectionStatus, retryCount])

  return {
    connectionStatus,
    isPolling,
    retryCount,
    pendingUpdates: useDeltaStore.getState().pendingUpdates,
  }
}