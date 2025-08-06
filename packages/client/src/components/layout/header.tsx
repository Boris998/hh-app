// src/components/layout/header.tsx
import { useSidebarStore } from '@/stores/sidebar-store'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { UserNav } from '@/components/user-nav'

export function Header() {
  const { toggle } = useSidebarStore()
  
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="flex h-16 items-center px-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="md:hidden mr-2"
          onClick={toggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        <div className="ml-auto flex items-center space-x-4">
          <UserNav />
        </div>
      </div>
    </header>
  )
}