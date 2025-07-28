// src/db/seeds/activity-types.seed.ts
import type { CreateActivityTypeRequest } from '../activity-types.schema.js';

export const activityTypesSeedData: CreateActivityTypeRequest[] = [
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
      allowDraws: true
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
      allowDraws: false
    }
  },

  {
    name: 'Handball',
    description: 'Fast team sport played with hands',
    category: 'team_sports',
    isSoloPerformable: false,
    displayOrder: 3,
    skillCategories: [
      {
        id: 'technique',
        name: 'Technical Skills',
        description: 'Ball handling and throwing techniques',
        skills: ['throwing', 'catching', 'dribbling', 'passing', 'shooting'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'physical',
        name: 'Physical Attributes',
        description: 'Strength and conditioning for handball',
        skills: ['throwing_power', 'jumping', 'speed', 'agility', 'endurance'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'tactical',
        name: 'Tactical Skills',
        description: 'Game strategy and positioning',
        skills: ['positioning', 'teamwork', 'offensive_play', 'defensive_play'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'mental',
        name: 'Mental Toughness',
        description: 'Psychological performance factors',
        skills: ['concentration', 'pressure_handling', 'decision_making'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 38, established: 20, expert: 16 },
      provisionalGames: 20,
      minimumParticipants: 8,
      teamBased: true,
      allowDraws: true
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
      allowDraws: false
    }
  },

  {
    name: 'Yoga',
    description: 'Mind-body practice combining physical postures and breathing',
    category: 'mind_body',
    isSoloPerformable: true,
    displayOrder: 5,
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
      startingELO: 1000,
      kFactor: { new: 25, established: 15, expert: 10 },
      provisionalGames: 10,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false
    }
  },

  {
    name: 'Fitness',
    description: 'General fitness and strength training',
    category: 'fitness',
    isSoloPerformable: true,
    displayOrder: 6,
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
      allowDraws: false
    }
  },

  {
    name: 'Functional Fitness',
    description: 'Movement-based fitness training for real-world applications',
    category: 'fitness',
    isSoloPerformable: true,
    displayOrder: 7,
    skillCategories: [
      {
        id: 'movement_patterns',
        name: 'Movement Patterns',
        description: 'Fundamental human movement skills',
        skills: ['squat_pattern', 'hinge_pattern', 'push_pattern', 'pull_pattern', 'carry'],
        weight: 0.35,
        displayOrder: 1
      },
      {
        id: 'coordination',
        name: 'Coordination & Balance',
        description: 'Multi-planar movement coordination',
        skills: ['balance', 'coordination', 'proprioception', 'reaction_time'],
        weight: 0.25,
        displayOrder: 2
      },
      {
        id: 'power',
        name: 'Functional Power',
        description: 'Explosive movement capabilities',
        skills: ['jumping', 'throwing', 'rotational_power', 'change_of_direction'],
        weight: 0.25,
        displayOrder: 3
      },
      {
        id: 'endurance',
        name: 'Work Capacity',
        description: 'Ability to sustain functional movements',
        skills: ['muscular_endurance', 'metabolic_conditioning', 'recovery', 'pacing'],
        weight: 0.15,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1150,
      kFactor: { new: 32, established: 20, expert: 14 },
      provisionalGames: 15,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false
    }
  },

  {
    name: 'Tennis',
    description: 'Racquet sport played individually or in doubles',
    category: 'individual_sports',
    isSoloPerformable: false,
    displayOrder: 8,
    skillCategories: [
      {
        id: 'strokes',
        name: 'Stroke Technique',
        description: 'Fundamental tennis strokes',
        skills: ['forehand', 'backhand', 'serve', 'volley', 'overhead', 'slice', 'drive_volley', 'return'],
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
      allowDraws: false
    }
  },

  {
    name: 'Ping Pong',
    description: 'Fast-paced table tennis requiring quick reflexes',
    category: 'individual_sports',
    isSoloPerformable: false,
    displayOrder: 9,
    skillCategories: [
      {
        id: 'technique',
        name: 'Stroke Technique',
        description: 'Basic ping pong strokes and spins',
        skills: ['forehand_drive', 'backhand_drive', 'serve', 'spin_control', 'blocking'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'reflexes',
        name: 'Speed & Reflexes',
        description: 'Quick reaction and hand-eye coordination',
        skills: ['reaction_time', 'hand_eye_coordination', 'quick_feet', 'anticipation'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'tactics',
        name: 'Table Tactics',
        description: 'Strategic play and positioning',
        skills: ['placement', 'pace_variation', 'spin_variation', 'rally_building'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'mental',
        name: 'Focus & Composure',
        description: 'Mental concentration under pressure',
        skills: ['concentration', 'composure', 'quick_thinking', 'adaptability'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 38, established: 22, expert: 16 },
      provisionalGames: 15,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: false
    }
  },

  {
    name: 'Golf',
    description: 'Precision sport played on outdoor courses',
    category: 'individual_sports',
    isSoloPerformable: true,
    displayOrder: 10,
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
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false
    }
  },

  {
    name: 'Psychology Session',
    description: 'Mental health and psychological well-being session',
    category: 'mind_body',
    isSoloPerformable: true,
    displayOrder: 11,
    skillCategories: [
      {
        id: 'self_awareness',
        name: 'Self-Awareness',
        description: 'Understanding of personal thoughts and emotions',
        skills: ['emotional_recognition', 'thought_patterns', 'trigger_awareness', 'self_reflection'],
        weight: 0.3,
        displayOrder: 1
      },
      {
        id: 'coping_strategies',
        name: 'Coping Strategies',
        description: 'Tools and techniques for managing stress',
        skills: ['stress_management', 'breathing_techniques', 'grounding_exercises', 'cognitive_restructuring'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'communication',
        name: 'Communication Skills',
        description: 'Expressing thoughts and feelings effectively',
        skills: ['active_listening', 'assertiveness', 'empathy', 'boundary_setting'],
        weight: 0.25,
        displayOrder: 3
      },
      {
        id: 'goal_setting',
        name: 'Goal Setting & Progress',
        description: 'Setting and working toward personal goals',
        skills: ['goal_clarity', 'action_planning', 'progress_tracking', 'motivation_maintenance'],
        weight: 0.15,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1000,
      kFactor: { new: 20, established: 12, expert: 8 },
      provisionalGames: 8,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false
    }
  },

  {
    name: 'Mental Health Session',
    description: 'Focused session on mental wellness and therapeutic practices',
    category: 'mind_body',
    isSoloPerformable: true,
    displayOrder: 12,
    skillCategories: [
      {
        id: 'mindfulness',
        name: 'Mindfulness & Meditation',
        description: 'Present-moment awareness and meditation practices',
        skills: ['meditation', 'mindful_breathing', 'body_awareness', 'present_moment_focus'],
        weight: 0.35,
        displayOrder: 1
      },
      {
        id: 'emotional_regulation',
        name: 'Emotional Regulation',
        description: 'Managing and processing emotions healthily',
        skills: ['emotion_identification', 'emotion_regulation', 'distress_tolerance', 'mood_tracking'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'cognitive_skills',
        name: 'Cognitive Skills',
        description: 'Thinking patterns and mental flexibility',
        skills: ['positive_thinking', 'problem_solving', 'cognitive_flexibility', 'rational_thinking'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'self_care',
        name: 'Self-Care Practices',
        description: 'Personal wellness and maintenance routines',
        skills: ['self_compassion', 'routine_building', 'energy_management', 'support_seeking'],
        weight: 0.15,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1000,
      kFactor: { new: 18, established: 10, expert: 6 },
      provisionalGames: 6,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false
    }
  },

  {
    name: 'Boxing',
    description: 'Combat sport focusing on punching techniques and conditioning',
    category: 'combat_sports',
    isSoloPerformable: false,
    displayOrder: 13,
    skillCategories: [
      {
        id: 'technique',
        name: 'Boxing Technique',
        description: 'Fundamental boxing skills and combinations',
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
      allowDraws: true
    }
  },

  {
    name: 'MMA',
    description: 'Mixed Martial Arts combining multiple fighting disciplines',
    category: 'combat_sports',
    isSoloPerformable: false,
    displayOrder: 14,
    skillCategories: [
      {
        id: 'striking',
        name: 'Striking',
        description: 'Stand-up fighting techniques',
        skills: ['boxing', 'muay_thai', 'kicks', 'knees', 'elbows', 'striking_defense'],
        weight: 0.35,
        displayOrder: 1
      },
      {
        id: 'grappling',
        name: 'Grappling',
        description: 'Wrestling and ground fighting',
        skills: ['takedowns', 'takedown_defense', 'ground_control', 'ground_and_pound'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'submissions',
        name: 'Submission Fighting',
        description: 'Joint locks and chokes',
        skills: ['submission_attempts', 'submission_defense', 'positional_control', 'transitions'],
        weight: 0.25,
        displayOrder: 3
      },
      {
        id: 'conditioning',
        name: 'MMA Conditioning',
        description: 'Physical and mental preparation',
        skills: ['cardio_endurance', 'strength_endurance', 'mental_toughness', 'cage_awareness'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 42, established: 26, expert: 20 },
      provisionalGames: 12,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: true
    }
  },

  {
    name: 'Biking',
    description: 'Cycling for fitness, recreation, or competition',
    category: 'outdoor_activities',
    isSoloPerformable: true,
    displayOrder: 15,
    skillCategories: [
      {
        id: 'endurance',
        name: 'Cycling Endurance',
        description: 'Cardiovascular fitness and stamina',
        skills: ['aerobic_capacity', 'lactate_threshold', 'long_distance_endurance', 'recovery'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'power',
        name: 'Power & Speed',
        description: 'Sprint capability and climbing power',
        skills: ['sprint_power', 'climbing_ability', 'time_trial_ability', 'explosive_power'],
        weight: 0.3,
        displayOrder: 2
      },
      {
        id: 'technique',
        name: 'Cycling Technique',
        description: 'Bike handling and efficiency',
        skills: ['bike_handling', 'cornering', 'pedaling_efficiency', 'aerodynamics'],
        weight: 0.2,
        displayOrder: 3
      },
      {
        id: 'tactics',
        name: 'Cycling Strategy',
        description: 'Race tactics and pacing',
        skills: ['pacing_strategy', 'drafting', 'positioning', 'race_tactics'],
        weight: 0.1,
        displayOrder: 4
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 32, established: 18, expert: 12 },
      provisionalGames: 15,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false
    }
  },

  {
    name: 'Volleyball',
    description: 'Team sport played with hands over a net',
    category: 'team_sports',
    isSoloPerformable: false,
    displayOrder: 16,
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
      allowDraws: false
    }
  }
];