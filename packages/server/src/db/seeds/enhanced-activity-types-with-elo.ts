// src/db/seeds/enhanced-activity-types-with-elo.ts - Updated with comprehensive ELO settings

import type { CreateActivityTypeRequest } from '../activity-types.schema.js';

export const enhancedActivityTypesSeedData: CreateActivityTypeRequest[] = [
  {
    name: 'Football',
    description: 'Association football (soccer) - the world\'s most popular sport',
    category: 'team_sports',
    isSoloPerformable: false,
    displayOrder: 1,
    skillCategories: [
      {
        id: 'technical',
        name: 'Technical Skills',
        description: 'Ball control and manipulation skills',
        skills: ['first_touch', 'passing', 'shooting', 'dribbling', 'crossing'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'physical',
        name: 'Physical Attributes',
        description: 'Physical capabilities and fitness',
        skills: ['speed', 'endurance', 'strength', 'agility', 'jumping'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'tactical',
        name: 'Tactical Awareness',
        description: 'Game understanding and positioning',
        skills: ['positioning', 'decision_making', 'vision', 'teamwork'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'mental',
        name: 'Mental Attributes',
        description: 'Psychological aspects of performance',
        skills: ['composure', 'concentration', 'leadership', 'communication'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 40, established: 20, expert: 16 },
      provisionalGames: 20,
      minimumParticipants: 10,
      teamBased: true,
      allowDraws: true,
      skillInfluence: 0.25, // 25% influence from skill ratings
      eloRanges: {
        beginner: { min: 0, max: 1000 },
        intermediate: { min: 1000, max: 1400 },
        advanced: { min: 1400, max: 1800 },
        expert: { min: 1800, max: 2400 },
      },
      specialRules: {
        goalDifferentialBonus: true, // Extra ELO for big wins
        maxELOChangePerGame: 50,
        drawPenalty: 0.1, // Slight penalty for draws
      }
    }
  },
  
  {
    name: 'Basketball',
    description: 'Fast-paced team sport played on indoor courts',
    category: 'team_sports',
    isSoloPerformable: false,
    displayOrder: 2,
    skillCategories: [
      {
        id: 'offensive',
        name: 'Offensive Skills',
        description: 'Scoring and ball-handling abilities',
        skills: ['shooting', 'dribbling', 'layups', 'free_throws', 'post_moves'],
        weight: 0.35,
        displayOrder: 1
      },
      {
        id: 'defensive',
        name: 'Defensive Skills',
        description: 'Preventing opponent scoring',
        skills: ['man_defense', 'rebounding', 'steals', 'blocks', 'help_defense'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'physical',
        name: 'Athletic Ability',
        description: 'Physical attributes for basketball',
        skills: ['vertical_jump', 'speed', 'agility', 'coordination', 'endurance'],
        weight: 0.25,
        displayOrder: 3
      },
      {
        id: 'mental',
        name: 'Basketball IQ',
        description: 'Game understanding and decision making',
        skills: ['court_vision', 'decision_making', 'teamwork', 'leadership'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 35, established: 18, expert: 14 },
      provisionalGames: 25,
      minimumParticipants: 6,
      teamBased: true,
      allowDraws: false, // Basketball rarely has draws
      skillInfluence: 0.3,
      eloRanges: {
        beginner: { min: 0, max: 1100 },
        intermediate: { min: 1100, max: 1500 },
        advanced: { min: 1500, max: 1900 },
        expert: { min: 1900, max: 2500 },
      },
      specialRules: {
        scoreDifferentialBonus: true,
        maxELOChangePerGame: 45,
        overtimeBonus: 1.1, // 10% bonus for overtime games
      }
    }
  },

  {
    name: 'Tennis',
    description: 'Racquet sport played individually or in doubles',
    category: 'individual_sports',
    isSoloPerformable: false, // Need opponent
    displayOrder: 3,
    skillCategories: [
      {
        id: 'strokes',
        name: 'Stroke Technique',
        description: 'Fundamental tennis strokes',
        skills: ['forehand', 'backhand', 'serve', 'volley', 'overhead', 'slice'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'movement',
        name: 'Court Movement',
        description: 'Footwork and positioning',
        skills: ['footwork', 'court_positioning', 'anticipation', 'recovery'],
        weight: 0.25,
        displayOrder: 2
      },
      {
        id: 'tactics',
        name: 'Tactical Awareness',
        description: 'Strategy and game planning',
        skills: ['point_construction', 'pattern_play', 'court_geometry', 'adaptation'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'mental',
        name: 'Mental Game',
        description: 'Psychological aspects of tennis',
        skills: ['concentration', 'pressure_handling', 'confidence', 'resilience'],
        weight: 0.15,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 35, established: 20, expert: 15 },
      provisionalGames: 20,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: false,
      skillInfluence: 0.35, // Higher skill influence in technical sports
      eloRanges: {
        beginner: { min: 0, max: 1000 },
        intermediate: { min: 1000, max: 1400 },
        advanced: { min: 1400, max: 1800 },
        expert: { min: 1800, max: 2200 },
      },
      specialRules: {
        setScoringBonus: true, // Bonus for straight set wins
        maxELOChangePerGame: 40,
        rankingConsistency: 0.9, // Favor consistent performance
      }
    }
  },

  {
    name: 'Running',
    description: 'Individual endurance and speed-based activity',
    category: 'individual_sports',
    isSoloPerformable: true,
    displayOrder: 4,
    skillCategories: [
      {
        id: 'endurance',
        name: 'Endurance',
        description: 'Cardiovascular and muscular endurance',
        skills: ['aerobic_capacity', 'lactate_threshold', 'muscle_endurance', 'VO2MAX'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'speed',
        name: 'Speed & Power',
        description: 'Sprint capabilities and explosive power',
        skills: ['sprint_speed', 'acceleration', 'stride_power', 'finishing_kick'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'technique',
        name: 'Running Form',
        description: 'Efficiency and biomechanics',
        skills: ['running_form', 'breathing', 'pacing', 'stride_efficiency'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'mental',
        name: 'Mental Strength',
        description: 'Psychological endurance and focus',
        skills: ['mental_toughness', 'focus', 'pain_tolerance', 'motivation'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 32, established: 16, expert: 12 },
      provisionalGames: 15,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: false, // Running is time-based
      skillInfluence: 0.2, // Lower skill influence, more performance-based
      eloRanges: {
        beginner: { min: 0, max: 1100 },
        intermediate: { min: 1100, max: 1400 },
        advanced: { min: 1400, max: 1700 },
        expert: { min: 1700, max: 2000 },
      },
      specialRules: {
        timeBasedRanking: true, // Use actual times for ranking
        maxELOChangePerGame: 35,
        weatherAdjustment: true, // Consider weather conditions
        distanceModifier: {
          'sprint': 1.2, // Higher volatility for sprints
          'middle': 1.0,
          'distance': 0.8, // Lower volatility for distance
        }
      }
    }
  },

  {
    name: 'Chess',
    description: 'Strategic board game requiring tactical thinking',
    category: 'mind_body',
    isSoloPerformable: false,
    displayOrder: 5,
    skillCategories: [
      {
        id: 'tactical',
        name: 'Tactical Skills',
        description: 'Pattern recognition and calculation',
        skills: ['pattern_recognition', 'calculation', 'combination_play', 'tactics'],
        weight: 0.3,
        displayOrder: 1
      },
      {
        id: 'strategic',
        name: 'Strategic Understanding',
        description: 'Long-term planning and positional play',
        skills: ['positional_play', 'planning', 'evaluation', 'endgame_knowledge'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'opening',
        name: 'Opening Knowledge',
        description: 'Theory and preparation',
        skills: ['opening_theory', 'preparation', 'novelties', 'understanding'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'psychological',
        name: 'Psychological Factors',
        description: 'Mental strength and time management',
        skills: ['time_management', 'pressure_handling', 'concentration', 'intuition'],
        weight: 0.2,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 25, established: 15, expert: 10 },
      provisionalGames: 30,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: true, // Chess commonly has draws
      skillInfluence: 0.4, // High skill influence in chess
      eloRanges: {
        beginner: { min: 0, max: 1200 },
        intermediate: { min: 1200, max: 1600 },
        advanced: { min: 1600, max: 2000 },
        expert: { min: 2000, max: 2800 },
      },
      specialRules: {
        timeControlModifier: {
          'bullet': 1.3, // Higher K-factor for fast games
          'blitz': 1.1,
          'rapid': 1.0,
          'classical': 0.9, // Lower K-factor for long games
        },
        maxELOChangePerGame: 30,
        drawBonus: 0, // No penalty for draws in chess
        ratingFloor: true, // Prevent rating from dropping too low
      }
    }
  },

  {
    name: 'Boxing',
    description: 'Combat sport focusing on punching techniques',
    category: 'combat_sports',
    isSoloPerformable: false,
    displayOrder: 6,
    skillCategories: [
      {
        id: 'technique',
        name: 'Boxing Technique',
        description: 'Fundamental boxing skills',
        skills: ['jab', 'cross', 'hook', 'uppercut', 'combinations', 'footwork'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'defense',
        name: 'Defensive Skills',
        description: 'Protecting against opponent attacks',
        skills: ['blocking', 'parrying', 'slipping', 'ducking', 'counter_punching'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'conditioning',
        name: 'Physical Conditioning',
        description: 'Strength, speed, and endurance for boxing',
        skills: ['punching_power', 'hand_speed', 'cardio_endurance', 'core_strength'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'ring_iq',
        name: 'Ring Intelligence',
        description: 'Tactical awareness and fight strategy',
        skills: ['ring_generalship', 'timing', 'distance_management', 'pressure_handling'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 40, established: 24, expert: 18 },
      provisionalGames: 15,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: true, // Boxing can have draws
      skillInfluence: 0.3,
      eloRanges: {
        beginner: { min: 0, max: 1000 },
        intermediate: { min: 1000, max: 1400 },
        advanced: { min: 1400, max: 1800 },
        expert: { min: 1800, max: 2400 },
      },
      specialRules: {
        knockoutBonus: 1.5, // 50% bonus for knockouts
        maxELOChangePerGame: 60,
        weightClassModifier: true, // Consider weight differences
        experienceGapPenalty: 0.1, // Penalty for large experience gaps
      }
    }
  },

  {
    name: 'Golf',
    description: 'Precision sport played on outdoor courses',
    category: 'individual_sports',
    isSoloPerformable: true,
    displayOrder: 7,
    skillCategories: [
      {
        id: 'full_swing',
        name: 'Full Swing',
        description: 'Driver and iron play from tee and fairway',
        skills: ['driver', 'iron_play', 'swing_mechanics', 'distance_control'],
        weight: 0.3,
        displayOrder: 1
      },
      {
        id: 'short_game',
        name: 'Short Game',
        description: 'Chipping, pitching, and greenside play',
        skills: ['chipping', 'pitching', 'bunker_play', 'touch_shots'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'putting',
        name: 'Putting',
        description: 'Green reading and putting stroke',
        skills: ['putting_stroke', 'green_reading', 'distance_control', 'pressure_putting'],
        weight: 0.25,
        displayOrder: 3
      },
      {
        id: 'course_management',
        name: 'Course Management',
        description: 'Strategy and decision making on course',
        skills: ['course_strategy', 'club_selection', 'risk_management', 'mental_game'],
        weight: 0.15,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 30, established: 16, expert: 12 },
      provisionalGames: 18,
      minimumParticipants: 1, // Can play solo against course
      teamBased: false,
      allowDraws: true, // Tied scores possible
      skillInfluence: 0.25,
      eloRanges: {
        beginner: { min: 0, max: 1100 },
        intermediate: { min: 1100, max: 1400 },
        advanced: { min: 1400, max: 1700 },
        expert: { min: 1700, max: 2000 },
      },
      specialRules: {
        strokePlayScoring: true, // Use actual strokes for ranking
        courseRatingAdjustment: true, // Adjust for course difficulty
        weatherAdjustment: true,
        maxELOChangePerGame: 25,
        consistencyBonus: 0.1, // Bonus for consistent rounds
      }
    }
  },

  {
    name: 'Yoga',
    description: 'Mind-body practice combining physical postures and breathing',
    category: 'mind_body',
    isSoloPerformable: true,
    displayOrder: 8,
    skillCategories: [
      {
        id: 'flexibility',
        name: 'Flexibility & Mobility',
        description: 'Range of motion and joint mobility',
        skills: ['forward_folds', 'backbends', 'hip_flexibility', 'shoulder_mobility'],
        weight: 0.3,
        displayOrder: 1
      },
      {
        id: 'strength',
        name: 'Strength & Stability',
        description: 'Core strength and balance',
        skills: ['core_strength', 'arm_strength', 'balance', 'stability'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'technique',
        name: 'Pose Alignment',
        description: 'Proper form and alignment in poses',
        skills: ['pose_alignment', 'transitions', 'modifications', 'breath_control'],
        weight: 0.25,
        displayOrder: 3
      },
      {
        id: 'mindfulness',
        name: 'Mindfulness & Focus',
        description: 'Mental awareness and concentration',
        skills: ['mindfulness', 'breath_awareness', 'meditation', 'presence'],
        weight: 0.15,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1000, // Lower starting point for wellness activities
      kFactor: { new: 25, established: 15, expert: 10 },
      provisionalGames: 10,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false, // Progress-based, not competitive
      skillInfluence: 0.5, // High skill influence for form-based activity
      eloRanges: {
        beginner: { min: 0, max: 800 },
        intermediate: { min: 800, max: 1200 },
        advanced: { min: 1200, max: 1600 },
        expert: { min: 1600, max: 2000 },
      },
      specialRules: {
        progressionBased: true, // Focus on personal improvement
        maxELOChangePerGame: 20,
        consistencyReward: 0.2, // Reward regular practice
        injuryPrevention: true, // Consider safety in ratings
      }
    }
  },

  {
    name: 'Fitness',
    description: 'General fitness and strength training',
    category: 'fitness',
    isSoloPerformable: true,
    displayOrder: 9,
    skillCategories: [
      {
        id: 'strength',
        name: 'Strength Training',
        description: 'Muscular strength and power',
        skills: ['compound_lifts', 'isolation_exercises', 'progressive_overload', 'form'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'cardio',
        name: 'Cardiovascular Fitness',
        description: 'Heart and lung conditioning',
        skills: ['aerobic_endurance', 'anaerobic_power', 'recovery', 'intensity_control'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'mobility',
        name: 'Mobility & Flexibility',
        description: 'Joint health and movement quality',
        skills: ['dynamic_warmup', 'static_stretching', 'mobility_work', 'injury_prevention'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'consistency',
        name: 'Training Discipline',
        description: 'Consistency and progression tracking',
        skills: ['consistency', 'progression_tracking', 'goal_setting', 'adaptation'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1100,
      kFactor: { new: 30, established: 18, expert: 12 },
      provisionalGames: 12,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false,
      skillInfluence: 0.3,
      eloRanges: {
        beginner: { min: 0, max: 1000 },
        intermediate: { min: 1000, max: 1400 },
        advanced: { min: 1400, max: 1800 },
        expert: { min: 1800, max: 2200 },
      },
      specialRules: {
        personalBestBonus: 1.2, // Bonus for personal records
        maxELOChangePerGame: 30,
        periodizationAware: true, // Consider training cycles
        bodyWeightRatio: true, // Consider strength-to-weight ratios
      }
    }
  },

  {
    name: 'Volleyball',
    description: 'Team sport played with hands over a net',
    category: 'team_sports',
    isSoloPerformable: false,
    displayOrder: 10,
    skillCategories: [
      {
        id: 'fundamental_skills',
        name: 'Fundamental Skills',
        description: 'Basic volleyball techniques',
        skills: ['serving', 'passing', 'setting', 'attacking', 'blocking'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'court_awareness',
        name: 'Court Awareness',
        description: 'Positioning and movement on court',
        skills: ['positioning', 'movement', 'anticipation', 'court_coverage'],
        weight: 0.25,
        displayOrder: 2
      },
      {
        id: 'teamwork',
        name: 'Team Coordination',
        description: 'Working effectively as a team unit',
        skills: ['communication', 'team_strategy', 'role_execution', 'support_play'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'physical',
        name: 'Physical Attributes',
        description: 'Athletic abilities for volleyball',
        skills: ['jumping_ability', 'reaction_time', 'agility', 'hand_eye_coordination'],
        weight: 0.15,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 36, established: 20, expert: 16 },
      provisionalGames: 18,
      minimumParticipants: 6,
      teamBased: true,
      allowDraws: false,
      skillInfluence: 0.28,
      eloRanges: {
        beginner: { min: 0, max: 1100 },
        intermediate: { min: 1100, max: 1500 },
        advanced: { min: 1500, max: 1900 },
        expert: { min: 1900, max: 2300 },
      },
      specialRules: {
        setScoreBonus: true, // Bonus for straight set wins
        maxELOChangePerGame: 42,
        rallyScoringAdjustment: true,
        positionSpecificRating: false, // All positions rated equally for now
      }
    }
  }
];

// 🆕 ELO Configuration Service for runtime access
export class ELOConfigurationService {
  private static configCache = new Map<string, any>();

  /**
   * Get ELO settings for a specific activity type
   */
  static async getELOSettings(activityTypeId: string): Promise<any> {
    if (this.configCache.has(activityTypeId)) {
      return this.configCache.get(activityTypeId);
    }

    // In production, this would query the database
    // For now, return default settings
    const defaultSettings = {
      startingELO: 1200,
      kFactor: { new: 32, established: 20, expert: 16 },
      provisionalGames: 20,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: true,
      skillInfluence: 0.25,
      eloRanges: {
        beginner: { min: 0, max: 1200 },
        intermediate: { min: 1200, max: 1600 },
        advanced: { min: 1600, max: 2000 },
        expert: { min: 2000, max: 2400 },
      }
    };

    this.configCache.set(activityTypeId, defaultSettings);
    return defaultSettings;
  }

  /**
   * Determine ELO skill level from score
   */
  static getSkillLevel(eloScore: number, activityTypeId?: string): string {
    // Default ranges, could be customized per activity type
    if (eloScore < 1000) return 'beginner';
    if (eloScore < 1400) return 'intermediate';
    if (eloScore < 1800) return 'advanced';
    return 'expert';
  }

  /**
   * Calculate recommended ELO range for matchmaking
   */
  static getMatchmakingRange(playerELO: number, tolerance: number = 200): { min: number; max: number } {
    return {
      min: Math.max(0, playerELO - tolerance),
      max: playerELO + tolerance,
    };
  }

  /**
   * Validate ELO settings configuration
   */
  static validateELOSettings(settings: any): boolean {
    const required = ['startingELO', 'kFactor', 'provisionalGames', 'minimumParticipants'];
    return required.every(field => field in settings);
  }

  /**
   * Get activity type specific bonuses and modifiers
   */
  static getSpecialRules(activityTypeId: string): any {
    // Return activity-specific rules from configuration
    // This would normally query the database
    return {
      maxELOChangePerGame: 50,
      skillInfluence: 0.25,
      allowDraws: true,
    };
  }
}

// 🆕 ELO Calculation Utilities
export class ELOUtilities {
  /**
   * Calculate expected win probability between two players
   */
  static calculateWinProbability(playerELO: number, opponentELO: number): number {
    return 1 / (1 + Math.pow(10, (opponentELO - playerELO) / 400));
  }

  /**
   * Estimate ELO change for a potential match
   */
  static estimateELOChange(
    playerELO: number, 
    opponentELO: number, 
    result: 'win' | 'loss' | 'draw',
    kFactor: number = 32
  ): number {
    const expectedScore = this.calculateWinProbability(playerELO, opponentELO);
    const actualScore = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5;
    return Math.round(kFactor * (actualScore - expectedScore));
  }

  /**
   * Suggest ideal opponents for a player
   */
  static suggestOpponents(
    playerELO: number, 
    availableOpponents: Array<{ id: string; elo: number; name: string }>,
    maxSuggestions: number = 5
  ): Array<{ id: string; elo: number; name: string; winProbability: number; eloChange: number }> {
    return availableOpponents
      .map(opponent => ({
        ...opponent,
        winProbability: this.calculateWinProbability(playerELO, opponent.elo),
        eloChange: this.estimateELOChange(playerELO, opponent.elo, 'win'),
      }))
      .sort((a, b) => Math.abs(0.5 - a.winProbability) - Math.abs(0.5 - b.winProbability))
      .slice(0, maxSuggestions);
  }

  /**
   * Calculate team average ELO with position weights
   */
  static calculateTeamELO(
    players: Array<{ elo: number; weight?: number }>,
    defaultWeight: number = 1
  ): number {
    const totalWeight = players.reduce((sum, p) => sum + (p.weight || defaultWeight), 0);
    const weightedSum = players.reduce((sum, p) => sum + p.elo * (p.weight || defaultWeight), 0);
    return Math.round(weightedSum / totalWeight);
  }
}

export { enhancedActivityTypesSeedData as activityTypesSeedData };