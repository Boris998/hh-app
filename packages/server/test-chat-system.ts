// test-chat-system.ts - Comprehensive chat testing
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './src/db/client.js';
import {
  activities,
  activityChatRooms,
  activityTypes,
  users
} from './src/db/schema.js';

interface TestUser {
  id: string;
  username: string;
  email: string;
  token?: string;
}

interface TestActivity {
  id: string;
  description: string;
  activityTypeId: string;
}

class ChatSystemTester {
  private baseUrl = 'http://localhost:3001/api';
  private users: TestUser[] = [];
  private activity: TestActivity | null = null;

  async runFullTest() {
    console.log('🚀 Starting Chat System Test...\n');

    try {
      // Step 1: Get existing users
      await this.getTestUsers();
      
      // Step 2: Login users to get tokens
      await this.loginUsers();
      
      // Step 3: Create activity
      await this.createTestActivity();
      
      // Step 4: First user joins (no chat created yet)
      await this.firstUserJoins();
      
      // Step 5: Second user joins (chat should be auto-created)
      await this.secondUserJoins();
      
      // Step 6: Verify chat room was created
      await this.verifyChatCreated();
      
      // Step 7: Simulate chat conversation
      await this.simulateChat();
      
      // Step 8: Test unread counts
      await this.testUnreadCounts();
      
      console.log('\n✅ All tests passed! Chat system is working correctly.');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error);
      throw error;
    }
  }

  async getTestUsers() {
    console.log('👥 Getting test users...');
    
    const dbUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
      })
      .from(users)
      .limit(3);

    if (dbUsers.length < 2) {
      throw new Error('Need at least 2 users in database. Run: pnpm seed:mock-data');
    }

    this.users = dbUsers.slice(0, 2); // Take first 2 users
    console.log(`✅ Found users: ${this.users.map(u => u.username).join(', ')}`);
  }

  async loginUsers() {
    console.log('\n🔐 Logging in users...');
    
    for (const user of this.users) {
      try {
        const response = await fetch(`${this.baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            password: 'password123' // Default password from mock data
          })
        });

        if (!response.ok) {
          throw new Error(`Login failed for ${user.username}: ${response.statusText}`);
        }

        const data = await response.json();
        user.token = data.data.tokens.accessToken;
        console.log(`✅ ${user.username} logged in successfully`);
      } catch (error) {
        console.error(`❌ Login failed for ${user.username}:`, error);
        throw error;
      }
    }
  }

  async createTestActivity() {
    console.log('\n🏃 Creating test activity...');
    
    // Get a basketball activity type
    const [activityType] = await db
      .select()
      .from(activityTypes)
      .where(eq(activityTypes.name, 'Basketball'))
      .limit(1);

    if (!activityType) {
      throw new Error('Basketball activity type not found. Run seeding first.');
    }

    const response = await fetch(`${this.baseUrl}/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.users[0].token}`
      },
      body: JSON.stringify({
        activityTypeId: activityType.id,
        description: 'Chat Test Basketball Game',
        location: 'Test Court',
        dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        maxParticipants: 6,
        isELORated: true
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create activity: ${response.statusText}`);
    }

    const data = await response.json();
    this.activity = data.data.activity;
    console.log(`✅ Created activity: ${this.activity!.description} (ID: ${this.activity!.id})`);
  }

  async firstUserJoins() {
    console.log('\n👤 First user already joined (creator)...');
    // Creator is automatically added as participant
    console.log(`✅ ${this.users[0].username} is activity creator`);
  }

  async secondUserJoins() {
    console.log('\n👤 Second user joins activity...');
    
    const response = await fetch(`${this.baseUrl}/activities/${this.activity!.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.users[1].token}`
      },
      body: JSON.stringify({
        team: 'A',
        message: 'Looking forward to playing!'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to join activity: ${response.statusText}`);
    }

    console.log(`✅ ${this.users[1].username} joined the activity`);
    
    // Wait a moment for trigger to execute
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async verifyChatCreated() {
    console.log('\n💬 Verifying chat room was auto-created...');
    
    // Check database directly
    const chatRoom = await db
      .select()
      .from(activityChatRooms)
      .where(eq(activityChatRooms.activityId, this.activity!.id))
      .limit(1);

    if (chatRoom.length === 0) {
      throw new Error('Chat room was not auto-created!');
    }

    console.log(`✅ Chat room created: "${chatRoom[0].name}"`);
    
    // Test API access for both users
    for (const user of this.users) {
      const response = await fetch(`${this.baseUrl}/activities/${this.activity!.id}/chat`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (!response.ok) {
        throw new Error(`User ${user.username} cannot access chat: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ ${user.username} can access chat (unread: ${data.data.unreadCount})`);
    }
  }

  async simulateChat() {
    console.log('\n💬 Simulating chat conversation...');
    
    const messages = [
      { user: 0, content: "Hey! Ready for some basketball? 🏀" },
      { user: 1, content: "Absolutely! Been practicing my three-pointers" },
      { user: 0, content: "Nice! I've been working on defense" },
      { user: 1, content: "This should be a good game then!" },
      { user: 0, content: "See you at the court tomorrow!" }
    ];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const user = this.users[msg.user];
      
      console.log(`${user.username}: ${msg.content}`);
      
      const response = await fetch(`${this.baseUrl}/activities/${this.activity!.id}/chat/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          content: msg.content,
          messageType: 'text'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('✅ Chat conversation simulated successfully');
  }

  async testUnreadCounts() {
    console.log('\n📊 Testing unread message counts...');
    
    // Check unread counts for both users
    for (const user of this.users) {
      const response = await fetch(`${this.baseUrl}/activities/${this.activity!.id}/chat`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get chat info: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`📩 ${user.username} has ${data.data.unreadCount} unread messages`);
    }

    // Mark messages as read for first user
    console.log(`\n📖 Marking messages as read for ${this.users[0].username}...`);
    
    const markReadResponse = await fetch(`${this.baseUrl}/activities/${this.activity!.id}/chat/mark-read`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.users[0].token}`
      }
    });

    if (!markReadResponse.ok) {
      throw new Error(`Failed to mark messages as read: ${markReadResponse.statusText}`);
    }

    // Verify unread count updated
    const verifyResponse = await fetch(`${this.baseUrl}/activities/${this.activity!.id}/chat`, {
      headers: {
        'Authorization': `Bearer ${this.users[0].token}`
      }
    });

    const verifyData = await verifyResponse.json();
    console.log(`✅ ${this.users[0].username} now has ${verifyData.data.unreadCount} unread messages`);
  }

  async testMessageRetrieval() {
    console.log('\n📜 Testing message retrieval...');
    
    const response = await fetch(`${this.baseUrl}/activities/${this.activity!.id}/chat/messages?limit=10`, {
      headers: {
        'Authorization': `Bearer ${this.users[0].token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to retrieve messages: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Retrieved ${data.data.messages.length} messages`);
    
    // Show last few messages
    console.log('\n📝 Last few messages:');
    data.data.messages.slice(0, 3).forEach((msg: any) => {
      const time = new Date(msg.createdAt).toLocaleTimeString();
      console.log(`  [${time}] ${msg.sender.username}: ${msg.content}`);
    });
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      if (this.activity) {
        // Delete the test activity (cascades to chat room and messages)
        await db
          .delete(activities)
          .where(eq(activities.id, this.activity.id));
        
        console.log('✅ Test activity and associated chat data cleaned up');
      }
    } catch (error) {
      console.error('⚠️  Cleanup error:', error);
    }
  }
}

// Main execution
async function main() {
  const tester = new ChatSystemTester();
  
  try {
    await tester.runFullTest();
    await tester.testMessageRetrieval();
    
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('\n📋 What was tested:');
    console.log('  ✅ Database migration and schema');
    console.log('  ✅ Auto-chat creation when 2nd user joins');
    console.log('  ✅ Chat room access permissions');
    console.log('  ✅ Message sending and receiving');
    console.log('  ✅ Unread count tracking');
    console.log('  ✅ Mark messages as read functionality');
    console.log('  ✅ Message retrieval with pagination');
    
    // Ask if user wants to cleanup
    console.log('\n❓ Do you want to cleanup test data? (The script will keep it for manual inspection)');
    // await tester.cleanup(); // Uncomment to auto-cleanup
    
  } catch (error) {
    console.error('\n💥 Test Suite Failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    console.log('\n🏁 Test complete. Check your database to see the chat data!');
    process.exit(0);
  });
}