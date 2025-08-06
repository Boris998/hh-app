// src/components/user-nav.tsx
import { Link } from "@tanstack/react-router";
import { LogOut, User, Settings, Activity, Trophy, Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";

export function UserNav() {
  const { user, logout } = useAuthStore();

  // Fetch user notifications count
  const { data: notificationCount = 0 } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/notifications/count", {
          headers: {
            Authorization: `Bearer ${useAuthStore.getState().token}`,
          },
        });
        if (!response.ok) return 0;
        const data = await response.json();
        return data.count || 0;
      } catch {
        return 0; // Return 0 if endpoint fails
      }
    },
    refetchInterval: 30000,
    retry: false,
    // queryFn: async () => {
    //   const response = await fetch('/api/notifications/count')
    //   if (!response.ok) return 0
    //   const data = await response.json()
    //   return data.count || 0
    // },
    // refetchInterval: 30000, // Check every 30 seconds
  });

  // Fetch user quick stats for dropdown
  const { data: userStats } = useQuery({
    queryKey: ["users", user?.id, "quick-stats"],
    queryFn: async () => {
      if (!user?.id) return null;
      const response = await fetch(`/api/users/${user.id}/quick-stats`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!user?.id,
  });

  if (!user) {
    return (
      <div className="flex items-center space-x-4">
        <Link to="/auth/login">
          <Button variant="ghost" size="sm">
            Sign In
          </Button>
        </Link>
        <Link to="/auth/register">
          <Button size="sm">Sign Up</Button>
        </Link>
      </div>
    );
  }

  const userInitials = user.username
    .split(" ")
    .map((name) => name[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center space-x-4">
      {/* Notifications */}
      <Link to="/notifications">
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center"
            >
              {notificationCount > 9 ? "9+" : notificationCount}
            </Badge>
          )}
        </Button>
      </Link>

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.avatarUrl} alt={user.username} />
              <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-72" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.username}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>

          {/* Quick stats */}
          {userStats && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-2">
                <div className="text-xs text-muted-foreground mb-2">
                  Quick Stats
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-blue-600">
                      {userStats.averageELO || "--"}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg ELO</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-600">
                      {userStats.activitiesThisWeek || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      This Week
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to="/profile" className="flex items-center">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link to="/profile/activities" className="flex items-center">
                <Activity className="mr-2 h-4 w-4" />
                <span>My Activities</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link to="/leaderboards" className="flex items-center">
                <Trophy className="mr-2 h-4 w-4" />
                <span>Leaderboards</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link to="/settings" className="flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="text-red-600 focus:text-red-600 focus:bg-red-50"
            onClick={logout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
