// Add these interfaces at the top of the file

export interface ELOSimulationParams {
  activityId: string;
  activityTypeId: string;
  participants: Array<{
    userId: string;
    username: string;
    currentELO: number;
    gamesPlayed: number;
    team?: string | null;
  }>;
  results: Array<{
    userId: string;
    expectedResult: 'win' | 'loss' | 'draw';
  }>;
}

export interface ELOSimulationResult {
  success: boolean;
  participants: Array<{
    userId: string;
    username: string;
    currentELO: number;
    newELO: number;
    change: number;
    explanation: string;
  }>;
  summary: {
    totalELOChange: number;
    averageChange: number;
    largestGain: number;
    largestLoss: number;
  };
}

export interface TeamBalanceParams {
  participants: Array<{
    id: string;
    userId: string;
    username: string;
    currentTeam?: string | null;
    eloScore: number;
  }>;
  teamCount: number;
}

export interface TeamBalanceResult {
  success: boolean;
  teams: Array<{
    name: string;
    members: Array<{
      userId: string;
      username: string;
      eloScore: number;
    }>;
    averageELO: number;
    totalELO: number;
  }>;
  metrics: {
    eloDifference: number;
    balance: number; // 0-1 where 1 is perfectly balanced
    fairness: string;
  };
  error?: string;
}
