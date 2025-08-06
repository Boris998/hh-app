// src/lib/api.ts
import { useAuthStore } from "@/stores/auth-store";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

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
  private baseURL: string;

  constructor() {
    this.baseURL = "";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const { token } = useAuthStore.getState();

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, config);

    // Handle auth errors
    if (response.status === 401) {
      useAuthStore.getState().logout();
      throw new Error("Authentication required");
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Request failed");
    }

    return data;
  }

  // Auth endpoints
  auth = {
    login: (email: string, password: string) =>
      this.request<{ user: any; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    register: (username: string, email: string, password: string) =>
      this.request<{ user: any; token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      }),

    refresh: () =>
      this.request<{ user: any; token: string }>("/auth/refresh", {
        method: "POST",
      }),

    me: () => this.request<{ user: any }>("/auth/me"),
  };

  // User endpoints
  users = {
    getProfile: (userId: string) => this.request<any>(`/users/${userId}`),

    updateProfile: (userId: string, data: any) =>
      this.request<any>(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    getQuickStats: (userId: string) =>
      this.request<{
        averageELO: number;
        activitiesThisWeek: number;
        totalActivities: number;
        friendsCount: number;
      }>(`/users/${userId}/quick-stats`),

    uploadAvatar: (userId: string, file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);

      return this.request<{ avatarUrl: string }>(`/users/${userId}/avatar`, {
        method: "POST",
        headers: {}, // Let browser set Content-Type for FormData
        body: formData,
      });
    },
  };

  // Activity endpoints
  activities = {
    list: (params?: {
      page?: number;
      limit?: number;
      activityType?: string;
      createdBy?: string;
      location?: string;
      dateFrom?: string;
      dateTo?: string;
      eloRange?: [number, number];
    }) => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) {
            if (Array.isArray(value)) {
              searchParams.append(key, value.join(","));
            } else {
              searchParams.append(key, String(value));
            }
          }
        });
      }

      return this.request<PaginatedResponse<any>>(
        `/activities?${searchParams}`
      );
    },

    getById: (id: string) => this.request<any>(`/activities/${id}`),

    create: (data: any) =>
      this.request<any>("/activities", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (id: string, data: any) =>
      this.request<any>(`/activities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      this.request<void>(`/activities/${id}`, {
        method: "DELETE",
      }),

    join: (id: string) =>
      this.request<any>(`/activities/${id}/join`, {
        method: "POST",
      }),

    leave: (id: string) =>
      this.request<any>(`/activities/${id}/leave`, {
        method: "POST",
      }),

    complete: (id: string, results: any) =>
      this.request<any>(`/activities/${id}/complete`, {
        method: "POST",
        body: JSON.stringify(results),
      }),
  };

  // Activity Types
  activityTypes = {
    list: () => this.request<any[]>("/activity-types"),

    getById: (id: string) => this.request<any>(`/activity-types/${id}`),
  };

  // ELO endpoints
  elo = {
    getUserELO: (userId: string, activityTypeId?: string) => {
      const endpoint = activityTypeId
        ? `/elo/${userId}?activityType=${activityTypeId}`
        : `/elo/${userId}`;
      return this.request<any>(endpoint);
    },

    getHistory: (userId: string, activityTypeId: string, days = 30) =>
      this.request<any[]>(
        `/elo/${userId}/${activityTypeId}/history?days=${days}`
      ),

    getLeaderboard: (activityTypeId: string, page = 1, limit = 50) =>
      this.request<PaginatedResponse<any>>(
        `/elo/leaderboard/${activityTypeId}?page=${page}&limit=${limit}`
      ),
  };

  // Skills endpoints
  skills = {
    getUserSkills: (userId: string, activityTypeId?: string) => {
      const endpoint = activityTypeId
        ? `/skills/${userId}?activityType=${activityTypeId}`
        : `/skills/${userId}`;
      return this.request<any>(endpoint);
    },

    rateSkills: (activityId: string, ratings: any[]) =>
      this.request<any>(`/activities/${activityId}/rate-skills`, {
        method: "POST",
        body: JSON.stringify({ ratings }),
      }),

    getSkillDefinitions: () => this.request<any[]>("/skills/definitions"),
  };

  // Social endpoints
  social = {
    getFriends: (userId: string) =>
      this.request<any[]>(`/users/${userId}/friends`),

    getFriendRequests: () => this.request<any[]>("/friends/requests"),

    sendFriendRequest: (userId: string) =>
      this.request<any>(`/friends/request/${userId}`, {
        method: "POST",
      }),

    acceptFriendRequest: (requestId: string) =>
      this.request<any>(`/friends/accept/${requestId}`, {
        method: "POST",
      }),

    rejectFriendRequest: (requestId: string) =>
      this.request<any>(`/friends/reject/${requestId}`, {
        method: "POST",
      }),

    removeFriend: (userId: string) =>
      this.request<any>(`/friends/remove/${userId}`, {
        method: "DELETE",
      }),
  };

  // Feed endpoints
  feed = {
    getActivityFeed: (page = 1, limit = 20) =>
      this.request<PaginatedResponse<any>>(`/feed?page=${page}&limit=${limit}`),

    createPost: (activityId: string, data: any) =>
      this.request<any>("/posts", {
        method: "POST",
        body: JSON.stringify({ activityId, ...data }),
      }),

    likePost: (postId: string) =>
      this.request<any>(`/posts/${postId}/like`, {
        method: "POST",
      }),

    addComment: (postId: string, comment: string) =>
      this.request<any>(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ comment }),
      }),
  };

  // Invitations endpoints
  invitations = {
    list: () => this.request<any[]>("/invitations"),

    send: (activityId: string, userIds: string[]) =>
      this.request<any>("/invitations", {
        method: "POST",
        body: JSON.stringify({ activityId, userIds }),
      }),

    respond: (invitationId: string, response: "accept" | "decline") =>
      this.request<any>(`/invitations/${invitationId}/respond`, {
        method: "POST",
        body: JSON.stringify({ response }),
      }),
  };

  // Delta polling
  deltas = {
    fetch: (since?: string) => {
      const endpoint = since ? `/deltas?since=${since}` : "/deltas";
      return this.request<{ deltas: any[]; timestamp: string }>(endpoint);
    },
  };

  // Notifications
  notifications = {
    list: (page = 1, limit = 20) =>
      this.request<PaginatedResponse<any>>(
        `/notifications?page=${page}&limit=${limit}`
      ).catch(() => ({
        data: [],
        pagination: { page, limit, total: 0, pages: 0 },
      })),
    getCount: () =>
      this.request<{ count: number }>("/notifications/count").catch(() => ({
        count: 0,
      })),
    markAsRead: (notificationId: string) =>
      this.request<any>(`/notifications/${notificationId}/read`, {
        method: "POST",
      }),

    markAllAsRead: () =>
      this.request<any>("/notifications/read-all", {
        method: "POST",
      }),
  };
}

export const api = new ApiClient();

// React Query helper functions
export const queryKeys = {
  // Users
  user: (id: string) => ["users", id] as const,
  userQuickStats: (id: string) => ["users", id, "quick-stats"] as const,
  userFriends: (id: string) => ["users", id, "friends"] as const,

  // Activities
  activities: (filters?: any) => ["activities", filters] as const,
  activity: (id: string) => ["activities", id] as const,
  activityTypes: () => ["activity-types"] as const,

  // ELO
  userELO: (userId: string, activityTypeId?: string) =>
    activityTypeId
      ? (["elo", userId, activityTypeId] as const)
      : (["elo", userId] as const),
  eloHistory: (userId: string, activityTypeId: string) =>
    ["elo", userId, activityTypeId, "history"] as const,
  leaderboard: (activityTypeId: string) =>
    ["leaderboards", activityTypeId] as const,

  // Skills
  userSkills: (userId: string, activityTypeId?: string) =>
    activityTypeId
      ? (["skills", userId, activityTypeId] as const)
      : (["skills", userId] as const),
  skillDefinitions: () => ["skills", "definitions"] as const,

  // Social
  friends: (userId: string) => ["friends", userId] as const,
  friendRequests: () => ["friends", "requests"] as const,
  feed: () => ["feed"] as const,

  // Invitations
  invitations: () => ["invitations"] as const,

  // Notifications
  notifications: () => ["notifications"] as const,
  notificationCount: () => ["notifications", "count"] as const,
};
