// debug-activity-types.ts - Debug what activity types endpoint returns

const baseUrl = 'http://localhost:3001/api';

async function debugActivityTypes() {
  console.log('🔍 DEBUGGING ACTIVITY TYPES ENDPOINT\n');
  
  try {
    console.log('📡 Making request to:', `${baseUrl}/activity-types`);
    
    const response = await fetch(`${baseUrl}/activity-types`);
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const rawText = await response.text();
    console.log('📄 Raw response text:', rawText);
    
    try {
      const jsonData = JSON.parse(rawText);
      console.log('📦 Parsed JSON:', JSON.stringify(jsonData, null, 2));
      
      console.log('\n🔍 Structure analysis:');
      console.log('   Type of response:', typeof jsonData);
      console.log('   Keys:', Object.keys(jsonData));
      
      if (jsonData.data) {
        console.log('   Type of data:', typeof jsonData.data);
        console.log('   Is data an array?', Array.isArray(jsonData.data));
        console.log('   Data keys/length:', Array.isArray(jsonData.data) ? jsonData.data.length : Object.keys(jsonData.data));
      } else {
        console.log('   No "data" property found');
      }
      
    } catch (parseError) {
      console.log('❌ Failed to parse as JSON:', parseError);
    }
    
  } catch (error) {
    console.log('💥 Request failed:', error);
  }
}

// Also check if we need to seed data
async function checkDatabase() {
  console.log('\n🗄️  CHECKING DATABASE DIRECTLY\n');
  
  try {
    const { db } = await import('./src/db/client.js');
    const { activityTypes } = await import('./src/db/schema.js');
    
    const types = await db.select().from(activityTypes).limit(5);
    
    console.log('📊 Direct database query results:');
    console.log('   Count:', types.length);
    console.log('   Types:', types);
    
    if (types.length === 0) {
      console.log('\n⚠️  No activity types in database!');
      console.log('💡 You need to seed activity types first.');
      console.log('\n📋 To seed activity types:');
      console.log('   1. Check: ls src/db/seeds/');
      console.log('   2. Run seeding script if available');
      console.log('   3. Or run the quick seed below');
      
      console.log('\n🚀 Quick seed command:');
      console.log(`
cat > quick-seed-activity-types.ts << 'EOF'
import 'dotenv/config';
import { db } from './src/db/client.js';
import { activityTypes } from './src/db/schema.js';

async function quickSeedActivityTypes() {
  const types = [
    {
      name: 'Basketball',
      description: 'Team basketball game',
      category: 'team_sports' as const,
      isSoloPerformable: false,
      defaultELOSettings: {
        startingELO: 1200,
        kFactor: { new: 40, established: 24, expert: 16 },
        teamBased: true,
        allowDraws: false,
        skillInfluence: 0.3
      }
    },
    {
      name: 'Tennis',
      description: 'Tennis match',
      category: 'individual_sports' as const,
      isSoloPerformable: false,
      defaultELOSettings: {
        startingELO: 1200,
        kFactor: { new: 32, established: 20, expert: 12 },
        teamBased: false,
        allowDraws: false,
        skillInfluence: 0.4
      }
    },
    {
      name: 'Running',
      description: 'Running exercise',
      category: 'fitness' as const,
      isSoloPerformable: true,
      defaultELOSettings: {
        startingELO: 1200,
        kFactor: { new: 24, established: 16, expert: 8 },
        teamBased: false,
        allowDraws: true,
        skillInfluence: 0.2
      }
    }
  ];

  for (const type of types) {
    await db.insert(activityTypes).values(type).onConflictDoNothing();
    console.log(\`✅ Created activity type: \${type.name}\`);
  }
  
  console.log('🎉 Activity types seeded successfully!');
}

quickSeedActivityTypes().catch(console.error);
EOF

pnpm tsx quick-seed-activity-types.ts
      `);
    }
    
  } catch (error) {
    console.log('💥 Database check failed:', error);
  }
}

async function main() {
  await debugActivityTypes();
  await checkDatabase();
}

main().catch(console.error);