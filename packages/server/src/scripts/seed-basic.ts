// scripts/seed-basic.ts - Simple seed for testing
import 'dotenv/config';
import { activityTypes } from '../db/schema';
import { db } from '../db';

const basicActivityTypes = [
  {
    name: 'Basketball',
    description: 'Fast-paced team sport played on indoor courts',
    category: 'team_sports' as const,
    isSoloPerformable: false,
    skillCategories: [
      {
        id: 'shooting',
        name: 'Shooting Skills',
        description: 'Accuracy and technique in scoring',
        skills: ['free_throws', 'three_pointers', 'layups'],
        weight: 0.4,
        displayOrder: 1
      },
      {
        id: 'defense',
        name: 'Defensive Skills', 
        description: 'Preventing opponent scoring',
        skills: ['rebounds', 'steals', 'blocks'],
        weight: 0.3,
        displayOrder: 2
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 40, established: 20, expert: 16 },
      provisionalGames: 25,
      minimumParticipants: 6,
      teamBased: true,
      allowDraws: false
    },
    displayOrder: 1
  },
  {
    name: 'Running',
    description: 'Individual endurance and speed-based activity',
    category: 'individual_sports' as const,
    isSoloPerformable: true,
    skillCategories: [
      {
        id: 'endurance',
        name: 'Endurance',
        description: 'Cardiovascular fitness',
        skills: ['aerobic_capacity', 'stamina'],
        weight: 0.5,
        displayOrder: 1
      },
      {
        id: 'speed',
        name: 'Speed',
        description: 'Sprint capabilities',
        skills: ['acceleration', 'top_speed'],
        weight: 0.5,
        displayOrder: 2
      }
    ],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 32, established: 16, expert: 12 },
      provisionalGames: 15,
      minimumParticipants: 2,
      teamBased: false,
      allowDraws: false
    },
    displayOrder: 2
  },
  {
    name: 'Yoga',
    description: 'Mind-body practice combining physical postures and breathing',
    category: 'mind_body' as const,
    isSoloPerformable: true,
    skillCategories: [
      {
        id: 'flexibility',
        name: 'Flexibility',
        description: 'Range of motion and joint mobility',
        skills: ['forward_folds', 'backbends'],
        weight: 0.6,
        displayOrder: 1
      },
      {
        id: 'balance',
        name: 'Balance & Stability',
        description: 'Core strength and balance',
        skills: ['standing_poses', 'arm_balances'],
        weight: 0.4,
        displayOrder: 2
      }
    ],
    defaultELOSettings: {
      startingELO: 1000,
      kFactor: { new: 25, established: 15, expert: 10 },
      provisionalGames: 10,
      minimumParticipants: 1,
      teamBased: false,
      allowDraws: false
    },
    displayOrder: 3
  }
];

async function seedBasicData() {
  console.log('🌱 Seeding basic activity types...');
  
  try {
    // Check if data already exists
    const existing = await db.select().from(activityTypes).limit(1);
    
    if (existing.length > 0) {
      console.log('ℹ️  Data already exists, skipping seed');
      return;
    }
    
    // Insert basic data
    const inserted = await db
      .insert(activityTypes)
      .values(basicActivityTypes)
      .returning({ id: activityTypes.id, name: activityTypes.name });
    
    console.log('✅ Successfully seeded activity types:');
    inserted.forEach(item => console.log(`   - ${item.name} (${item.id})`));
    
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedBasicData()
    .then(() => {
      console.log('🎉 Seeding completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}