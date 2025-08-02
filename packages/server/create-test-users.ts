// create-test-users.ts - Quick setup of test users for auth testing

import 'dotenv/config';
import { db } from './src/db/client.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

interface TestUser {
  username: string;
  email: string;
  password: string;
  role?: 'user' | 'admin' | 'moderator';
}

const testUsers: TestUser[] = [
  {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    role: 'user'
  },
  {
    username: 'admin',
    email: 'admin@example.com', 
    password: 'admin123',
    role: 'admin'
  },
  {
    username: 'alice',
    email: 'alice@example.com',
    password: 'alice123',
    role: 'user'
  },
  {
    username: 'bob',
    email: 'bob@example.com',
    password: 'bob123',
    role: 'user'
  }
];

async function createTestUsers() {
  console.log('👥 Creating test users for authentication...\n');

  try {
    for (const testUser of testUsers) {
      // Check if user already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, testUser.email))
        .limit(1);

      if (existing.length > 0) {
        console.log(`⏭️  User ${testUser.email} already exists, skipping...`);
        continue;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(testUser.password, 12);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          username: testUser.username,
          email: testUser.email,
          passwordHash,
          role: testUser.role || 'user',
        })
        .returning();

      console.log(`✅ Created user: ${newUser.username} (${newUser.email}) - Role: ${newUser.role}`);
    }

    console.log('\n📊 Test Users Summary:');
    const allUsers = await db
      .select({
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt
      })
      .from(users);

    allUsers.forEach(user => {
      console.log(`   👤 ${user.username} (${user.email}) - ${user.role}`);
    });

    console.log(`\n🎉 Total users in database: ${allUsers.length}`);
    
    console.log('\n📋 Ready for Authentication Testing:');
    console.log('   Login credentials:');
    testUsers.forEach(user => {
      console.log(`   📧 ${user.email} / 🔑 ${user.password}`);
    });

    console.log('\n🚀 Next steps:');
    console.log('   1. Start server: pnpm dev');
    console.log('   2. Run auth test: pnpm tsx test-auth-fix.ts');
    console.log('   3. Proceed to ELO implementation');

  } catch (error) {
    console.error('❌ Failed to create test users:', error);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('🎯 TEST USER SETUP\n');
  
  try {
    await createTestUsers();
    console.log('\n✅ Test user setup completed successfully!');
  } catch (error) {
    console.error('\n💥 Test user setup failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check database connection (DATABASE_URL in .env)');
    console.log('   2. Run migrations: pnpm drizzle:migrate');
    console.log('   3. Verify users table exists');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    console.log('\nSetup completed.');
    process.exit(0);
  }).catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}