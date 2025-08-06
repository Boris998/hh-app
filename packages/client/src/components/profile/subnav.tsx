// src/components/profile/subnav.tsx
import { Link, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export function ProfileSubnav() {
  const router = useRouter()
  const { pathname } = router.state.location
  
  const links = [
    { path: "/profile", label: "Overview" },
    { path: "/profile/activities", label: "Activities" },
    { path: "/profile/readiness", label: "Readiness" },
    { path: "/profile/posts", label: "Posts" },
    { path: "/profile/friends", label: "Friends" }
  ]

  return (
    <div className="border-b">
      <nav className="-mb-px flex space-x-8">
        {links.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={cn(
              "whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium",
              pathname.startsWith(link.path)
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-gray-300"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}