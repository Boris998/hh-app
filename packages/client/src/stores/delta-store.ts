// src/stores/delta-store.ts - Enhanced delta polling with latest backend integration
import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import { useAuthStore } from "./auth-store";
import { useEffect } from "react";

interface DeltaChange {
  id: string;
  entityType:
    | "activity"
    | "user"
    | "skill_rating"
    | "elo"
    | "notification"
    | "connection";
  entityId: string;
  changeType: "create" | "update" | "delete";
  newData: any;
  oldData?: any;
  affectedUserId: string;
  relatedEntityId?: string;
  triggeredBy: string;
  changeSource: "user_action" | "system" | "elo_calculation";
  timestamp: string;
  metadata?: any;
}

interface DeltaStore {
  // State
  lastSync: string | null;
  connectionStatus: "connected" | "disconnected" | "connecting" | "error";
  pendingChanges: DeltaChange[];
  isPolling: boolean;
  pollInterval: number;

  // Actions
  setLastSync: (timestamp: string) => void;
  setConnectionStatus: (status: DeltaStore["connectionStatus"]) => void;
  addPendingChanges: (changes: DeltaChange[]) => void;
  clearPendingChanges: () => void;
  setPolling: (isPolling: boolean) => void;
  setPollInterval: (interval: number) => void;

  // Delta processing
  processDelta: (delta: DeltaChange) => void;
  applyChangesToStore: (changes: DeltaChange[]) => void;
}

export const useDeltaStore = create<DeltaStore>((set, get) => ({
  // Initial state
  lastSync: null,
  connectionStatus: "disconnected",
  pendingChanges: [],
  isPolling: false,
  pollInterval: 5000, // 5 seconds default

  // Actions
  setLastSync: (timestamp: string) => {
    set({ lastSync: timestamp });
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },

  addPendingChanges: (changes: DeltaChange[]) => {
    set((state) => ({
      pendingChanges: [...state.pendingChanges, ...changes],
    }));
  },

  clearPendingChanges: () => {
    set({ pendingChanges: [] });
  },

  setPolling: (isPolling: boolean) => {
    set({ isPolling });
  },

  setPollInterval: (interval: number) => {
    set({ pollInterval: interval });
  },

  processDelta: (delta: DeltaChange) => {
    console.log("Processing delta:", delta);

    // Handle different entity types
    switch (delta.entityType) {
      case "activity":
        // Invalidate activity queries
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("invalidate-activities", {
              detail: { activityId: delta.entityId },
            })
          );
        }
        break;

      case "elo":
        // Invalidate ELO queries
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("invalidate-elo", {
              detail: { userId: delta.affectedUserId },
            })
          );
        }
        break;

      case "skill_rating":
        // Invalidate skill rating queries
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("invalidate-skills", {
              detail: {
                userId: delta.affectedUserId,
                activityId: delta.relatedEntityId,
              },
            })
          );
        }
        break;

      case "notification":
        // Invalidate notification queries
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("invalidate-notifications"));
        }
        break;

      case "connection":
        // Invalidate friend/connection queries
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("invalidate-connections", {
              detail: { userId: delta.affectedUserId },
            })
          );
        }
        break;
    }
  },

  applyChangesToStore: (changes: DeltaChange[]) => {
    changes.forEach((change) => {
      get().processDelta(change);
    });
  },
}));

// Custom hook for delta polling
export function useDeltaPolling() {
  const { isAuthenticated } = useAuthStore();
  const {
    lastSync,
    connectionStatus,
    isPolling,
    pollInterval,
    setLastSync,
    setConnectionStatus,
    addPendingChanges,
    applyChangesToStore,
    setPolling,
  } = useDeltaStore();

  // Delta polling query
  const deltaQuery = useQuery({
    queryKey: queryKeys.deltaChanges(lastSync || undefined),
    queryFn: async () => {
      try {
        setConnectionStatus("connecting");
        const response = await api.delta.getChanges(lastSync || undefined);

        if (response.success) {
          setConnectionStatus("connected");
          return response.data;
        } else {
          setConnectionStatus("error");
          return {
            deltas: [],
            timestamp: new Date().toISOString(),
            hasMore: false,
          };
        }
      } catch (error) {
        console.error("Delta polling error:", error);
        setConnectionStatus("error");
        return {
          deltas: [],
          timestamp: new Date().toISOString(),
          hasMore: false,
        };
      }
    },
    enabled: isAuthenticated && isPolling,
    refetchInterval: pollInterval,
    retry: (failureCount, error) => {
      // Exponential backoff for retries
      if (failureCount < 3) {
        setTimeout(() => {}, Math.pow(2, failureCount) * 1000);
        return true;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Process deltas when query data changes
  useEffect(() => {
    if (deltaQuery.data?.deltas && deltaQuery.data.deltas.length > 0) {
      console.log(`📡 Received ${deltaQuery.data.deltas.length} deltas`);

      // Apply changes to store
      applyChangesToStore(deltaQuery.data.deltas);

      // Update last sync timestamp
      setLastSync(deltaQuery.data.timestamp);

      // Add to pending changes for debugging
      addPendingChanges(deltaQuery.data.deltas);
    }
  }, [deltaQuery.data, applyChangesToStore, setLastSync, addPendingChanges]);

  // Health check query
  const healthQuery = useQuery({
    queryKey: queryKeys.deltaHealth(),
    queryFn: () => api.delta.getHealth(),
    enabled: isAuthenticated,
    refetchInterval: 30000, // Check health every 30 seconds
    retry: false,
  });

  // Auto-start polling when authenticated
  useEffect(() => {
    if (isAuthenticated && !isPolling) {
      setPolling(true);
      console.log("🔄 Started delta polling");
    } else if (!isAuthenticated && isPolling) {
      setPolling(false);
      setConnectionStatus("disconnected");
      console.log("⏹️ Stopped delta polling");
    }
  }, [isAuthenticated, isPolling, setPolling, setConnectionStatus]);

  // Adaptive polling interval based on activity
  useEffect(() => {
    if (deltaQuery.data?.hasMore) {
      // More changes available, poll faster
      useDeltaStore.getState().setPollInterval(2000);
    } else {
      // No more changes, poll slower
      useDeltaStore.getState().setPollInterval(5000);
    }
  }, [deltaQuery.data?.hasMore]);

  return {
    // State
    connectionStatus,
    isPolling,
    lastSync,
    pendingChangesCount: useDeltaStore((state) => state.pendingChanges.length),
    healthData: healthQuery.data,
    // Actions
    startPolling: () => setPolling(true),
    stopPolling: () => setPolling(false),
    setPollInterval: (interval: number) =>
      useDeltaStore.getState().setPollInterval(interval),
    getConnectionStatus: () => connectionStatus,
    getIsPolling: () => isPolling,
    getLastSync: () => lastSync,
    getPendingChangesCount: () =>
      useDeltaStore.getState().pendingChanges.length,
  };
}
