import { useAuthStore } from "@/stores/auth-store";

// src/lib/api.ts - Updated with latest backend endpoints
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class ApiClient {
  private baseURL = "/api";

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const { token } = useAuthStore.getState();

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(error.message || error.error || "Request failed");
    }

    return response.json();
  }

  // Auth endpoints
  auth = {
    login: (credentials: { email: string; password: string }) =>
      this.request<{ success: boolean; data: { user: any; token: string } }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify(credentials),
        }
      ),

    register: (userData: {
      username: string;
      email: string;
      password: string;
    }) =>
      this.request<{ success: boolean; data: { user: any; token: string } }>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify(userData),
        }
      ),

    logout: () =>
      this.request<{ success: boolean }>("/auth/logout", {
        method: "POST",
      }),

    refreshToken: () =>
      this.request<{ success: boolean; data: { token: string } }>(
        "/auth/refresh",
        {
          method: "POST",
        }
      ),

    getMe: () =>
      this.request<{ success: boolean; data: { user: any } }>("/auth/me"),
  };

  // Users endpoints
  users = {
    getQuickStats: (userId: string) =>
      this.request<{
        success: boolean;
        data: {
          totalActivities: number;
          averageELO: number;
          activitiesThisWeek: number;
          skillRatings: number;
          friendsCount: number;
        };
      }>(`/users/${userId}/quick-stats`),

    getUserElo: (userId: string, activityTypeId?: string) => {
      const endpoint = activityTypeId
        ? `/users/${userId}/elo?activityType=${activityTypeId}`
        : `/users/${userId}/elo`;
      return this.request<{ success: boolean; data: any[] }>(endpoint);
    },

    // Alias for backward compatibility
    getELO: (userId: string, activityTypeId?: string) => {
      return this.users.getUserElo(userId, activityTypeId);
    },

    getSkills: (userId: string, activityTypeId?: string) => {
      const endpoint = activityTypeId
        ? `/users/${userId}/skills?activityType=${activityTypeId}`
        : `/users/${userId}/skills`;
      return this.request<{ success: boolean; data: any[] }>(endpoint);
    },

    getActivityStats: (userId: string) =>
      this.request<{ success: boolean; data: any }>(
        `/users/${userId}/activity-stats`
      ),

    getProfile: (userId: string) =>
      this.request<{ success: boolean; data: { user: any; stats: any } }>(
        `/users/profile/${userId}`
      ),

    updateProfile: (
      updateData: Partial<{
        username: string;
        email: string;
        avatarUrl: string;
      }>
    ) =>
      this.request<{
        success: boolean;
        data: { user: any; token?: string };
        message: string;
      }>("/users/profile", {
        method: "PATCH",
        body: JSON.stringify(updateData),
      }),

    // Connection management
    sendConnectionRequest: (targetUserId: string) =>
      this.request<{ success: boolean; message: string }>(
        "/users/connections/request",
        {
          method: "POST",
          body: JSON.stringify({ targetUserId }),
        }
      ),

    respondToConnection: (connectionId: string, action: "accept" | "reject") =>
      this.request<{ success: boolean; message: string }>(
        `/users/connections/${connectionId}/respond`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        }
      ),

    getFriends: (userId: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/users/${userId}/friends`
      ),

    getFriendRequests: () =>
      this.request<{ success: boolean; data: any[] }>(
        "/users/connections/requests"
      ),
  };

  // Activities endpoints - Updated with latest backend features
  activities = {
    list: (params?: {
      page?: number;
      limit?: number;
      activityTypeId?: string;
      createdBy?: string;
      location?: string;
      dateFrom?: string;
      dateTo?: string;
      eloRange?: [number, number];
      status?: "scheduled" | "active" | "completed" | "cancelled";
      participationStatus?: "pending" | "accepted" | "declined" | "rated";
      participationStatuses?: ("pending" | "accepted" | "declined" | "rated")[];
    }) => {
      const searchParams = new URLSearchParams();
      if (params) {
        // Convert numbers to strings for URL parameters
        if (params.page !== undefined) {
          searchParams.append("page", params.page.toString());
        }
        if (params.limit !== undefined) {
          searchParams.append("limit", params.limit.toString());
        }
        if (params.activityTypeId) {
          searchParams.append("activityTypeId", params.activityTypeId);
        }
        if (params.createdBy) {
          searchParams.append("createdBy", params.createdBy);
        }
        if (params.location) {
          searchParams.append("location", params.location);
        }
        if (params.dateFrom) {
          searchParams.append("dateFrom", params.dateFrom);
        }
        if (params.dateTo) {
          searchParams.append("dateTo", params.dateTo);
        }
        if (params.eloRange) {
          searchParams.append("eloMin", params.eloRange[0].toString());
          searchParams.append("eloMax", params.eloRange[1].toString());
        }
        if (params.status) {
          searchParams.append("status", params.status);
        }
        if (params.participationStatus) {
          searchParams.append("participationStatus", params.participationStatus);
        }
      }

      const queryString = searchParams.toString();
      const endpoint = queryString
        ? `/activities?${queryString}`
        : "/activities";

      return this.request<{ success: boolean; data: { activities: any[]; pagination: any } }>(endpoint);
    },

    get: (id: string) =>
      this.request<{ success: boolean; data: any }>(`/activities/${id}`),

    getById: (id: string) =>
      this.request<{
        success: boolean;
        data: {
          activity: any;
          activityType: any;
          creator: any;
          participants: any[];
          userParticipation: any;
          description: string;
          maxParticipants: any;
          date: any;
          eloStatus: any;
          skills: any[];
          teamStats: any;
          eloDistribution: any;
          capabilities: {
            canEdit: boolean;
            canJoin: boolean;
            canLeave: boolean;
            canComplete: boolean;
            canRateSkills: boolean;
          };
        };
      }>(`/activities/${id}`),

    create: (data: {
      activityTypeId: string;
      description: string;
      location?: string;
      dateTime: string;
      maxParticipants?: number;
      eloLevel?: number;
      isELORated?: boolean;
    }) =>
      this.request<{
        success: boolean;
        data: { activity: any };
        message: string;
      }>("/activities", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      data: Partial<{
        description: string;
        location: string;
        dateTime: string;
        maxParticipants: number;
        eloLevel: number;
        isELORated: boolean;
      }>
    ) =>
      this.request<{
        success: boolean;
        data: { activity: any };
        message: string;
      }>(`/activities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    join: (id: string, team?: string) =>
      this.request<{
        success: boolean;
        data: { participant: any };
        message: string;
      }>(`/activities/${id}/join`, {
        method: "POST",
        body: JSON.stringify({ team }),
      }),

    leave: (id: string, reason?: string) =>
      this.request<{ success: boolean; message: string }>(
        `/activities/${id}/leave`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        }
      ),

    complete: (
      id: string,
      results: {
        participants: Array<{
          userId: string;
          finalResult: "win" | "loss" | "draw";
          performanceNotes?: string;
        }>;
        notes?: string;
      }
    ) =>
      this.request<{
        success: boolean;
        data: { activity: any; eloChanges?: any[] };
        message: string;
      }>(`/activities/${id}/complete`, {
        method: "POST",
        body: JSON.stringify(results),
      }),

    // Participant management
    manageParticipant: (
      activityId: string,
      participantId: string,
      action: "accept" | "reject" | "remove",
      reason?: string
    ) =>
      this.request<{
        success: boolean;
        data: { participant: any; action: string };
        message: string;
      }>(`/activities/${activityId}/participants/${participantId}`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      }),
  };

  // Activity Types endpoints
  activityTypes = {
    list: () =>
      this.request<{ success: boolean; data: { activityTypes: any[]; totalCount: number } }>("/activity-types"),

    get: (id: string) =>
      this.request<{ success: boolean; data: any }>(`/activity-types/${id}`),

    getByCategory: (category: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/activity-types/category/${category}`
      ),

    search: (query: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/activity-types/search?q=${encodeURIComponent(query)}`
      ),

    getSkills: (id: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/activity-types/${id}/skills`
      ),

    getELOSettings: (id: string) =>
      this.request<{ success: boolean; data: any }>(
        `/activity-types/${id}/elo-settings`
      ),
  };

  // Skill Rating endpoints - New comprehensive skill system
  skillRatings = {
    submit: (data: {
      activityId: string;
      ratedUserId: string;
      skillDefinitionId: string;
      ratingValue: number;
      comment?: string;
    }) =>
      this.request<{ success: boolean; message: string }>("/skill-ratings", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    getActivityPending: (activityId: string) =>
      this.request<{
        success: boolean;
        data: {
          activity: any;
          participants: any[];
          skills: any[];
          existingRatings: any[];
          canSubmitRatings: boolean;
        };
      }>(`/skill-ratings/activity/${activityId}/pending`),

    getUserRatings: (userId: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/skill-ratings/user/${userId}`
      ),

    getLeaderboard: (
      skillDefinitionId: string,
      activityTypeId?: string,
      page = 1,
      limit = 50
    ) => {
      const searchParams = new URLSearchParams({
        skillDefinitionId,
        page: String(page),
        limit: String(limit),
      });
      if (activityTypeId) {
        searchParams.append("activityTypeId", activityTypeId);
      }
      return this.request<{
        success: boolean;
        data: {
          skill: any;
          leaderboard: any[];
          pagination: { page: number; limit: number; hasMore: boolean };
        };
      }>(`/skill-ratings/leaderboard?${searchParams}`);
    },

    getMyPending: () =>
      this.request<{ success: boolean; data: any[] }>(
        "/skill-ratings/my-pending"
      ),

    getPending: (activityId: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/skill-ratings/activity/${activityId}/pending`
      ),

    getActivityRatings: (activityId: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/skill-ratings/activity/${activityId}`
      ),
  };

  // ELO specific endpoints
  elo = {
    getUserELO: (userId: string, activityTypeId?: string) => {
      const endpoint = activityTypeId
        ? `/users/${userId}/elo?activityType=${activityTypeId}`
        : `/users/${userId}/elo`;
      return this.request<{ success: boolean; data: any[] }>(endpoint);
    },

    getHistory: (userId: string, activityTypeId: string, days = 30) =>
      this.request<{ success: boolean; data: any[] }>(
        `/elo/${userId}/${activityTypeId}/history?days=${days}`
      ),

    getLeaderboard: (activityTypeId: string, page = 1, limit = 50) =>
      this.request<
        PaginatedResponse<{
          user: { id: string; username: string; avatarUrl?: string };
          eloScore: number;
          gamesPlayed: number;
          rank: number;
          change?: number;
        }>
      >(`/activities/elo-leaderboard/${activityTypeId}?page=${page}&limit=${limit}`),

    getAllLeaderboards: (page = 1, limit = 10) =>
      this.request<
        PaginatedResponse<{
          activityType: any;
          topPlayers: any[];
        }>
      >(`/elo/leaderboards?page=${page}&limit=${limit}`),
  };

  // Skills endpoints
  skills = {
    getDefinitions: () =>
      this.request<{ success: boolean; data: any[] }>("/skills/definitions"),

    getUserSkills: (userId: string, activityTypeId?: string) => {
      const endpoint = activityTypeId
        ? `/users/${userId}/skills?activityType=${activityTypeId}`
        : `/users/${userId}/skills`;
      return this.request<{ success: boolean; data: any[] }>(endpoint);
    },

    getSkillHistory: (
      userId: string,
      skillDefinitionId: string,
      activityTypeId?: string
    ) => {
      const searchParams = new URLSearchParams({ skillDefinitionId });
      if (activityTypeId) {
        searchParams.append("activityTypeId", activityTypeId);
      }
      return this.request<{ success: boolean; data: any[] }>(
        `/skills/${userId}/history?${searchParams}`
      );
    },
  };

  feed = {
    getActivityFeed: (page = 1, limit = 20) =>
      this.request<PaginatedResponse<any>>(`/feed?page=${page}&limit=${limit}`),

    createPost: (activityId: string, data: { content: string }) =>
      this.request<any>("/feed/posts", {
        method: "POST",
        body: JSON.stringify({ activityId, ...data }),
      }),

    likePost: (postId: string) =>
      this.request<any>(`/feed/posts/${postId}/like`, {
        method: "POST",
      }),

    addComment: (postId: string, comment: string) =>
      this.request<any>(`/feed/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ comment }),
      }),
  };

  // Delta polling for real-time updates
  delta = {
    getChanges: (since?: string) => {
      const endpoint = since
        ? `/delta/changes?since=${since}`
        : "/delta/changes";
      return this.request<{
        success: boolean;
        data: {
          deltas: any[];
          timestamp: string;
          hasMore: boolean;
        };
      }>(endpoint);
    },

    getHealth: () =>
      this.request<{
        status: string;
        timestamp: string;
        activeConnections: number;
        lastDeltaTime: string;
      }>("/delta/health"),
  };

  // Notifications
  notifications = {
    list: (page = 1, limit = 20) =>
      this.request<
        PaginatedResponse<{
          id: string;
          type: string;
          title: string;
          message: string;
          isRead: boolean;
          data?: any;
          createdAt: string;
        }>
      >(`/notifications?page=${page}&limit=${limit}`).catch(() => ({
        data: [],
        pagination: { page, limit, total: 0, pages: 0 },
      })),

    getCount: () =>
      this.request<{ success: boolean; data: { count: number } }>(
        "/notifications/count"
      ).catch(() => ({
        success: true,
        data: { count: 0 },
      })),

    markAsRead: (notificationId: string) =>
      this.request<{ success: boolean; message: string }>(
        `/notifications/${notificationId}/read`,
        {
          method: "POST",
        }
      ),

    markAllAsRead: () =>
      this.request<{ success: boolean; message: string }>(
        "/notifications/read-all",
        {
          method: "POST",
        }
      ),
  };

  invitations = {
    list: () => this.request<any[]>("/invitations"),

    getPending: () =>
      this.request<{ success: boolean; data: any[] }>("/invitations/pending"),

    accept: (invitationId: string) =>
      this.request<{ success: boolean; message: string }>(
        `/invitations/${invitationId}/accept`,
        { method: "POST" }
      ),

    decline: (invitationId: string) =>
      this.request<{ success: boolean; message: string }>(
        `/invitations/${invitationId}/decline`,
        { method: "POST" }
      ),

    send: (activityId: string, userId: string) =>
      this.request<{ success: boolean; message: string }>("/invitations", {
        method: "POST",
        body: JSON.stringify({ activityId, userId }),
      }),
  };

  // Messaging endpoints
  messaging = {
    getConversations: (page = 1, limit = 20) =>
      this.request<PaginatedResponse<any>>(
        `/messaging/conversations?page=${page}&limit=${limit}`
      ),

    getMessages: (conversationId: string, page = 1, limit = 50) =>
      this.request<PaginatedResponse<any>>(
        `/messaging/conversations/${conversationId}/messages?page=${page}&limit=${limit}`
      ),

    sendMessage: (conversationId: string, content: string, type = "text") =>
      this.request<{ success: boolean; data: any }>(
        `/messaging/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content, type }),
        }
      ),

    createConversation: (participantIds: string[], title?: string) =>
      this.request<{ success: boolean; data: any }>(
        "/messaging/conversations",
        {
          method: "POST",
          body: JSON.stringify({ participantIds, title }),
        }
      ),
  };

  // Activity Chat endpoints
  chat = {
    getRooms: (activityId: string) =>
      this.request<{ success: boolean; data: any[] }>(
        `/chat/${activityId}/rooms`
      ),

    getMessages: (roomId: string, page = 1, limit = 50) =>
      this.request<PaginatedResponse<any>>(
        `/chat/rooms/${roomId}/messages?page=${page}&limit=${limit}`
      ),

    sendMessage: (roomId: string, content: string, type = "text") =>
      this.request<{ success: boolean; data: any }>(
        `/chat/rooms/${roomId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content, type }),
        }
      ),

    joinRoom: (roomId: string) =>
      this.request<{ success: boolean; message: string }>(
        `/chat/rooms/${roomId}/join`,
        {
          method: "POST",
        }
      ),

    leaveRoom: (roomId: string) =>
      this.request<{ success: boolean; message: string }>(
        `/chat/rooms/${roomId}/leave`,
        {
          method: "POST",
        }
      ),
  };

  getActivity = (activityId: string) => this.activities.getById(activityId);

  getActivities = (params?: {
    page?: number;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }) => this.activities.list(params);

  getUserQuickStats = (userId: string) => this.users.getQuickStats(userId);

  getUserElo = (userId: string) => this.users.getUserElo(userId);

  getInvitations = () => this.invitations.list();

  getNotifications = () => this.notifications.list();

  getMe = () => this.auth.getMe();

  getActivityTypes = () => this.activityTypes.list();
}

export const api = new ApiClient();

// React Query helper functions - Updated with new endpoints
export const queryKeys = {
  // Users
  user: (id: string) => ["users", id] as const,
  userQuickStats: (id: string) => ["users", id, "quick-stats"] as const,
  userELO: (id: string, activityTypeId?: string) =>
    activityTypeId
      ? (["users", id, "elo", activityTypeId] as const)
      : (["users", id, "elo"] as const),
  userSkills: (id: string, activityTypeId?: string) =>
    activityTypeId
      ? (["users", id, "skills", activityTypeId] as const)
      : (["users", id, "skills"] as const),
  userActivityStats: (id: string, activityTypeId?: string) => 
    activityTypeId 
      ? (["users", id, "activity-stats", activityTypeId] as const)
      : (["users", id, "activity-stats"] as const),
  userProfile: (id: string) => ["users", id, "profile"] as const,
  userFriends: (id: string) => ["users", id, "friends"] as const,
  friendRequests: () => ["users", "connections", "requests"] as const,

  // Activities
  activities: (filters?: any) => ["activities", filters] as const,
  activity: (id: string) => ["activities", id] as const,
  activityTypes: () => ["activity-types"] as const,
  activityType: (id: string) => ["activity-types", id] as const,
  activityTypesByCategory: (category: string) =>
    ["activity-types", "category", category] as const,
  activityTypesSearch: (query: string) =>
    ["activity-types", "search", query] as const,
  activityTypeSkills: (id: string) => ["activity-types", id, "skills"] as const,
  activityTypeELOSettings: (id: string) =>
    ["activity-types", id, "elo-settings"] as const,

  // Skill Ratings
  skillRatings: (userId: string, filters?: any) =>
    ["skill-ratings", "user", userId, filters] as const,
  skillRatingsPending: (activityId: string) =>
    ["skill-ratings", "activity", activityId, "pending"] as const,
  skillRatingsActivity: (activityId: string) =>
    ["skill-ratings", "activity", activityId] as const,
  skillRatingsMyPending: () => ["skill-ratings", "my-pending"] as const,
  skillLeaderboard: (skillId: string, activityTypeId?: string) =>
    activityTypeId
      ? (["skill-ratings", "leaderboard", skillId, activityTypeId] as const)
      : (["skill-ratings", "leaderboard", skillId] as const),

  // ELO
  eloHistory: (userId: string, activityTypeId: string, days?: number) =>
    ["elo", userId, activityTypeId, "history", days] as const,
  eloLeaderboard: (activityTypeId: string) =>
    ["elo", "leaderboard", activityTypeId] as const,
  eloAllLeaderboards: () => ["elo", "leaderboards"] as const,

  // Skills
  skillDefinitions: () => ["skills", "definitions"] as const,
  skillHistory: (userId: string, skillId: string, activityTypeId?: string) =>
    activityTypeId
      ? (["skills", userId, skillId, "history", activityTypeId] as const)
      : (["skills", userId, skillId, "history"] as const),

  // Delta polling
  deltaChanges: (since?: string) => ["delta", "changes", since] as const,
  deltaHealth: () => ["delta", "health"] as const,

  // Notifications
  notifications: (page?: number) => ["notifications", page] as const,
  notificationCount: () => ["notifications", "count"] as const,

  // Messaging
  conversations: (page?: number) =>
    ["messaging", "conversations", page] as const,
  messages: (conversationId: string, page?: number) =>
    ["messaging", "conversations", conversationId, "messages", page] as const,

  // Chat
  chatRooms: (activityId: string) => ["chat", activityId, "rooms"] as const,
  chatMessages: (roomId: string, page?: number) =>
    ["chat", "rooms", roomId, "messages", page] as const,
};
