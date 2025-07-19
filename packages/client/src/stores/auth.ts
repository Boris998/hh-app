import { create } from 'zustand';

type AuthStore = {
  user: null | { email: string };
  error: string | null;
  register: (email: string, password: string, name?: string) => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  error: null,
  register: async (email, password, name) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      set({ user: data.user, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  },
  clearError: () => set({ error: null }),
}));