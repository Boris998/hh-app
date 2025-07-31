// verify-chat-db.ts - Quick database verification
import 'dotenv/config';
import { db } from './src/db/client.js';
import { 
  activityChatRooms, 
  activityChatMessages, 
  activityChatReadStatus,
  activities,
  activityParticipants,
  users 
} from './src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

async function verifyDatabase() {
  console.log('🔍 Verifying Chat System Database Setup...\n');

  try {
    // 1. Check if chat tables exist and have proper structure
    console.log('1️⃣ Checking table structure...');
    
    const tablesCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%chat%'
    `);
    
    console.log('✅ Chat tables found:');
    tablesCheck.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });

    // 2. Check if triggers exist
    console.log('\n2️⃣ Checking database triggers...');
    
    const triggersCheck = await db.execute(sql`
      SELECT trigger_name, event_object_table 
      FROM information_schema.triggers 
      WHERE trigger_name LIKE '%chat%'
    `);
    
    console.log('✅ Chat triggers found:');
    triggersCheck.forEach(trigger => {
      console.log(`   - ${trigger.trigger_name} on ${trigger.event_object_table}`);
    });

    // 3. Check existing activities that could have chat
    console.log('\n3️⃣ Checking activities with 2+ participants...');
    
    const activitiesWithParticipants = await db.execute(sql`
      SELECT 
        a.id,
        a.description,
        COUNT(ap.user_id) as participant_count,
        EXISTS(SELECT 1 FROM activity_chat_rooms acr WHERE acr.activity_id = a.id) as has_chat
      FROM activities a
      LEFT JOIN activity_participants ap ON a.id = ap.activity_id AND ap.status = 'accepted'
      GROUP BY a.id, a.description
      HAVING COUNT(ap.user_id) >= 2
    `);

    console.log('✅ Activities with 2+ participants:');
    activitiesWithParticipants.forEach(activity => {
      console.log(`   - ${activity.description}: ${activity.participant_count} participants, Chat: ${activity.has_chat ? '✅' : '❌'}`);
    });

    // 4. Check if any chat rooms exist
    console.log('\n4️⃣ Checking existing chat rooms...');
    
    const existingChats = await db
      .select({
        id: activityChatRooms.id,
        name: activityChatRooms.name,
        activityId: activityChatRooms.activityId,
        isActive: activityChatRooms.isActive,
        messageCount: sql<number>`(
          SELECT COUNT(*) 
          FROM activity_chat_messages 
          WHERE chat_room_id = ${activityChatRooms.id}
        )`,
      })
      .from(activityChatRooms);

    if (existingChats.length > 0) {
      console.log('✅ Existing chat rooms:');
      existingChats.forEach(chat => {
        console.log(`   - ${chat.name}: ${chat.messageCount} messages (Active: ${chat.isActive})`);
      });
    } else {
      console.log('ℹ️  No chat rooms exist yet');
    }

    // 5. Check users available for testing
    console.log('\n5️⃣ Checking available test users...');
    
    const testUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
      })
      .from(users)
      .limit(5);

    console.log('✅ Available test users:');
    testUsers.forEach(user => {
      console.log(`   - ${user.username} (${user.email})`);
    });

    // 6. Test trigger manually if no chats exist
    if (existingChats.length === 0 && activitiesWithParticipants.length > 0) {
      console.log('\n6️⃣ Testing auto-chat creation...');
      console.log('💡 Activities with 2+ participants exist but no chats.');
      console.log('   This means triggers might not be working or chats were not auto-created.');
      console.log('   Try creating a new activity and having a second user join it.');
    }

    console.log('\n✅ Database verification complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Start your server: pnpm start');
    console.log('2. Run the test script: tsx test-chat-system.ts');
    console.log('3. Or manually test with: bash manual-chat-test.sh');

  } catch (error) {
    console.error('❌ Database verification failed:', error);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure you ran the migration: pnpm db:push');
    console.log('2. Check if database connection is working: pnpm db:studio');
    console.log('3. Verify environment variables are set correctly');
  }
}

// Run verification
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyDatabase().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}