// src/stores/auth-store.ts - Updated with latest backend integration
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

export interface User {
  id: string
  publicId: string
  username: string
  email: string
  avatarUrl?: string
  role: string
  createdAt: string
  updatedAt: string
}

interface AuthStore {
  // State
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>
  register: (userData: { username: string; email: string; password: string }) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshToken: () => Promise<boolean>
  updateProfile: (updateData: Partial<{ username: string; email: string; avatarUrl: string }>) => Promise<{ success: boolean; error?: string }>
  clearError: () => void
  setLoading: (loading: boolean) => void
  
  // Initialize auth state on app start
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (credentials) => {
        try {
          set({ isLoading: true, error: null })

          const response = await api.auth.login(credentials)
          
          if (response.success) {
            const { user, token } = response.data
            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
            return { success: true }
          } else {
            set({ 
              isLoading: false, 
              error: 'Login failed' 
            })
            return { success: false, error: 'Login failed' }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed'
          set({ 
            isLoading: false, 
            error: errorMessage 
          })
          return { success: false, error: errorMessage }
        }
      },

      register: async (userData) => {
        try {
          set({ isLoading: true, error: null })

          const response = await api.auth.register(userData)
          
          if (response.success) {
            const { user, token } = response.data
            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
            return { success: true }
          } else {
            set({ 
              isLoading: false, 
              error: 'Registration failed' 
            })
            return { success: false, error: 'Registration failed' }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Registration failed'
          set({ 
            isLoading: false, 
            error: errorMessage 
          })
          return { success: false, error: errorMessage }
        }
      },

      logout: async () => {
        try {
          // Call logout endpoint to invalidate token on server
          await api.auth.logout().catch(() => {
            // Continue with client-side logout even if server logout fails
            console.warn('Server logout failed, proceeding with client logout')
          })
        } catch (error) {
          console.warn('Logout request failed:', error)
        } finally {
          // Always clear client state
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          })
        }
      },

      refreshToken: async () => {
        try {
          const response = await api.auth.refreshToken()
          
          if (response.success) {
            const { token } = response.data
            set({ token })
            return true
          } else {
            // Refresh failed, logout user
            get().logout()
            return false
          }
        } catch (error) {
          console.error('Token refresh failed:', error)
          // Refresh failed, logout user
          get().logout()
          return false
        }
      },

      updateProfile: async (updateData) => {
        try {
          set({ isLoading: true, error: null })

          const response = await api.users.updateProfile(updateData)
          
          if (response.success) {
            const { user, token } = response.data
            
            // Update user in state
            set(state => ({
              user: { ...state.user, ...user },
              // Update token if new one provided (for username/email changes)
              token: token || state.token,
              isLoading: false,
              error: null,
            }))
            
            return { success: true }
          } else {
            set({ 
              isLoading: false, 
              error: 'Profile update failed' 
            })
            return { success: false, error: 'Profile update failed' }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Profile update failed'
          set({ 
            isLoading: false, 
            error: errorMessage 
          })
          return { success: false, error: errorMessage }
        }
      },

      clearError: () => {
        set({ error: null })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      initialize: async () => {
        const { token } = get()
        
        if (!token) {
          set({ isAuthenticated: false, isLoading: false })
          return
        }

        try {
          set({ isLoading: true })
          
          // Verify token is still valid by fetching user
          const response = await api.auth.getMe()
          
          if (response.success) {
            const { user } = response.data
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
          } else {
            // Token invalid, clear auth state
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            })
          }
        } catch (error) {
          console.error('Auth initialization failed:', error)
          
          // Try to refresh token
          const refreshed = await get().refreshToken()
          
          if (!refreshed) {
            // Both auth check and refresh failed, clear state
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            })
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)