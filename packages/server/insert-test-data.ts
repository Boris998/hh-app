import 'dotenv/config';
import { db } from './src/db/client.js';
import { activityTypes } from './src/db/schema.js';

console.log('🌱 Adding test activity types...');

const testData = [
  {
    name: 'Basketball',
    description: 'Fast-paced team sport',
    category: 'team_sports' as const,
    isSoloPerformable: false,
    skillCategories: [],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 40, established: 20, expert: 16 }
    },
    displayOrder: 1
  },
  {
    name: 'Running',
    description: 'Individual endurance sport', 
    category: 'individual_sports' as const,
    isSoloPerformable: true,
    skillCategories: [],
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 32, established: 16, expert: 12 }
    },
    displayOrder: 2
  }
];

try {
  const result = await db.insert(activityTypes).values(testData).returning({
    id: activityTypes.id,
    name: activityTypes.name
  });
  
  console.log('✅ Successfully added:');
  result.forEach(item => console.log(`   - ${item.name} (${item.id})`));
  
  console.log('\n🧪 Test with: curl http://localhost:3001/api/activity-types');
  
} catch (error) {
  console.error('❌ Error adding data:', error);
} finally {
  process.exit(0);
}