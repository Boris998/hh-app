// scripts/setup-database.ts
import { execSync } from 'child_process';
import { seedActivityTypes } from '../db/seeds/seed-activity-types';

async function setupDatabase() {
  console.log('🚀 Setting up database...\n');
  
  try {
    // Step 1: Generate and apply migrations
    console.log('📝 Generating migrations...');
    execSync('pnpm db:generate', { stdio: 'inherit' });
    
    console.log('\n📤 Applying migrations...');
    execSync('pnpm db:push', { stdio: 'inherit' });
    
    // Step 2: Seed activity types
    console.log('\n🌱 Seeding activity types...');
    await seedActivityTypes();
    
    console.log('\n✅ Database setup completed successfully!');
    console.log('\n📊 Next steps:');
    console.log('1. Start your server: pnpm start');
    console.log('2. Test activity types API: GET /api/activity-types');
    console.log('3. Check specific activity: GET /api/activity-types/category/team_sports');
    
  } catch (error) {
    console.error('\n❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase().then(() => process.exit(0));
}

export { setupDatabase };