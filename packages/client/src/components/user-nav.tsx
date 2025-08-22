// src/components/user-nav.tsx - Updated with latest backend integration
import { Link } from "@tanstack/react-router";
import { LogOut, User, Settings, Activity, Trophy, TrendingUp } from "lucide-react";
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
import { api, queryKeys } from "@/lib/api";

export function UserNav() {
  const { user, logout } = useAuthStore();

  // Fetch user quick stats for dropdown
  const { data: userStatsData } = useQuery({
    queryKey: queryKeys.userQuickStats(user?.id || ''),
    queryFn: () => api.users.getQuickStats(user?.id || ''),
    enabled: !!user?.id,
    retry: false,
  });

  // Fetch user's current ELO across activity types
  const { data: userELOData } = useQuery({
    queryKey: queryKeys.userELO(user?.id || ''),
    queryFn: () => api.users.getELO(user?.id || ''),
    enabled: !!user?.id,
    retry: false,
  });

  // Fetch pending skill ratings count
  const { data: pendingRatingsData } = useQuery({
    queryKey: queryKeys.skillRatingsMyPending(),
    queryFn: () => api.skillRatings.getMyPending(),
    enabled: !!user?.id,
    refetchInterval: 30000,
    retry: false,
  });

  const handleLogout = async () => {
    await logout();
  };

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

  const userStats = userStatsData?.data;
  const userELOs = userELOData?.data || [];
  const pendingRatingsCount = pendingRatingsData?.data?.length || 0;
  
  // Get highest ELO for display
  const highestELO = userELOs.length > 0 
    ? Math.max(...userELOs.map(elo => elo.eloScore || 1200))
    : 1200;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatarUrl} alt={user.username} />
            <AvatarFallback className="bg-blue-600 text-white">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {pendingRatingsCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center"
            >
              {pendingRatingsCount > 9 ? '9+' : pendingRatingsCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.avatarUrl} alt={user.username} />
                <AvatarFallback className="bg-blue-600 text-white text-lg">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.username}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
            
            {/* Quick Stats */}
            {userStats && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div className="text-center">
                  <p className="text-lg font-semibold">{userStats.totalActivities}</p>
                  <p className="text-xs text-muted-foreground">Activities</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold">{Math.round(highestELO)}</p>
                  <p className="text-xs text-muted-foreground">Peak ELO</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold">{userStats.activitiesThisWeek}</p>
                  <p className="text-xs text-muted-foreground">This Week</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold">{userStats.friendsCount}</p>
                  <p className="text-xs text-muted-foreground">Friends</p>
                </div>
              </div>
            )}
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/profile" className="w-full flex items-center">
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem asChild>
            <Link to="/profile/activities" className="w-full flex items-center">
              <Activity className="mr-2 h-4 w-4" />
              <span>My Activities</span>
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem asChild>
            <Link to="/leaderboards" className="w-full flex items-center">
              <Trophy className="mr-2 h-4 w-4" />
              <span>Leaderboards</span>
            </Link>
          </DropdownMenuItem>

          {pendingRatingsCount > 0 && (
            <DropdownMenuItem asChild>
              <Link to="/skill-ratings" className="w-full flex items-center justify-between">
                <div className="flex items-center">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  <span>Pending Ratings</span>
                </div>
                <Badge variant="destructive" className="h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {pendingRatingsCount > 9 ? '9+' : pendingRatingsCount}
                </Badge>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/settings" className="w-full flex items-center">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}