// src/stores/sidebar-store.ts
import { create } from 'zustand'

type SidebarStore = {
  isOpen: boolean
  toggle: () => void
  close: () => void
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false })
}))