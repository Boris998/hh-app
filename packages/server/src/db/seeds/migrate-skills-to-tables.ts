// src/db/seeds/create-mock-data.ts - FINAL FIXED VERSION

import 'dotenv/config';
import { db } from '../client.js';
import { 
  users, 
  activities, 
  activityParticipants,
  userActivityTypeELOs,
  activityTypes
} from '../schema.js';
import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const MOCK_USERS = [
  { username: 'alex_player', email: 'alex@example.com', firstName: 'Alex', lastName: 'Johnson' },
  { username: 'sarah_athlete', email: 'sarah@example.com', firstName: 'Sarah', lastName: 'Wilson' },
  { username: 'mike_coach', email: 'mike@example.com', firstName: 'Mike', lastName: 'Brown' },
  { username: 'emma_sport', email: 'emma@example.com', firstName: 'Emma', lastName: 'Davis' },
  { username: 'james_fit', email: 'james@example.com', firstName: 'James', lastName: 'Miller' },
  { username: 'lisa_active', email: 'lisa@example.com', firstName: 'Lisa', lastName: 'Taylor' },
  { username: 'boris_tadirov', email: 'btadirov16@gmail.com', firstName: 'Boris', lastName: 'Tadirov' },
];

export async function createMockData() {
  console.log('🎭 Creating mock data...');
  
  try {
    // Step 1: Check existing users and create only missing ones
    console.log('👥 Checking existing users...');
    
    const existingUsers = await db.select().from(users);
    const existingUsernames = new Set(existingUsers.map(u => u.username));
    const existingEmails = new Set(existingUsers.map(u => u.email));
    
    console.log(`📋 Found ${existingUsers.length} existing users`);
    
    // Filter out users that already exist
    const newUsers = MOCK_USERS.filter(user => 
      !existingUsernames.has(user.username) && !existingEmails.has(user.email)
    );
    
    let allUsers = existingUsers;
    
    if (newUsers.length > 0) {
      console.log(`👥 Creating ${newUsers.length} new mock users...`);
      
      const hashedPassword = await bcrypt.hash('1_Pass@hH-app', 10);
      
      const mockUserData = newUsers.map(user => ({
        ...user,
        passwordHash: hashedPassword,
        role: 'user' as const,
      }));
      
      const insertedUsers = await db
        .insert(users)
        .values(mockUserData)
        .returning({ id: users.id, username: users.username, email: users.email });
      
      console.log(`✅ Created ${insertedUsers.length} new mock users`);
      
      // Refresh all users list
      allUsers = await db.select().from(users);
    } else {
      console.log('ℹ️  All mock users already exist, skipping user creation');
    }
    
    // Step 2: Get activity types
    const allActivityTypes = await db.select().from(activityTypes);
    console.log(`📋 Found ${allActivityTypes.length} activity types`);
    
    if (allActivityTypes.length === 0) {
      throw new Error('No activity types found! Run: pnpm seed:activity-types first');
    }
    
    // Step 3: Check existing ELO scores and create missing ones
    console.log('🏆 Checking existing ELO scores...');
    
    const existingELOs = await db.select().from(userActivityTypeELOs);
    const existingELOKeys = new Set(
      existingELOs.map(elo => `${elo.userId}-${elo.activityTypeId}`)
    );
    
    console.log(`📋 Found ${existingELOs.length} existing ELO records`);
    
    const eloData = [];
    for (const user of allUsers.slice(0, 6)) { // Use first 6 users (mock users)
      // Give each user ELO scores for first 5 activity types
      const activityCount = Math.min(5, allActivityTypes.length);
      for (let i = 0; i < activityCount; i++) {
        const activityType = allActivityTypes[i];
        const eloKey = `${user.id}-${activityType.id}`;
        
        if (!existingELOKeys.has(eloKey)) {
          eloData.push({
            userId: user.id,
            activityTypeId: activityType.id,
            eloScore: 1150 + Math.floor(Math.random() * 100), // 1150-1250 range
            gamesPlayed: Math.floor(Math.random() * 10),
            peakELO: 1200 + Math.floor(Math.random() * 50),
          });
        }
      }
    }
    
    if (eloData.length > 0) {
      await db.insert(userActivityTypeELOs).values(eloData);
      console.log(`✅ Created ${eloData.length} new ELO records`);
    } else {
      console.log('ℹ️  All ELO records already exist');
    }
    
    // Step 4: Check existing activities and create missing ones
    console.log('🏃 Checking existing activities...');
    
    const existingActivities = await db.select().from(activities);
    console.log(`📋 Found ${existingActivities.length} existing activities`);
    
    let activitiesToUse = existingActivities;
    
    if (existingActivities.length < 5) {
      console.log('🏃 Creating sample activities...');
      
      const now = new Date();
      const activitiesData = [];
      const activitiesToCreate = Math.min(5 - existingActivities.length, allActivityTypes.length);
      
      // Create activities using available activity types and users
      for (let i = 0; i < activitiesToCreate; i++) {
        const activityType = allActivityTypes[i % allActivityTypes.length];
        const creator = allUsers[i % Math.min(6, allUsers.length)]; // Use first 6 users
        
        activitiesData.push({
          activityTypeId: activityType.id,
          creatorId: creator.id,
          description: `Weekly ${activityType.name} session #${existingActivities.length + i + 1}`,
          location: `Sports Center ${String.fromCharCode(65 + i)}`,
          dateTime: new Date(now.getTime() + (i * 24 * 60 * 60 * 1000)), // Future dates
          maxParticipants: 6 + (i * 2),
          eloLevel: 1200,
          isELORated: true,
          completionStatus: i < 2 ? 'completed' : 'scheduled',
        });
      }
      
      if (activitiesData.length > 0) {
        const insertedActivities = await db
          .insert(activities)
          .values(activitiesData as any)
          .returning({ id: activities.id });
        
        console.log(`✅ Created ${insertedActivities.length} sample activities`);
        
        // Refresh activities list
        activitiesToUse = await db.select().from(activities);
      }
    } else {
      console.log('ℹ️  Sufficient activities already exist');
    }
    
    // Step 5: Check existing participants and add missing ones
    console.log('👥 Checking activity participants...');
    
    const existingParticipants = await db.select().from(activityParticipants);
    const existingParticipantKeys = new Set(
      existingParticipants.map(p => `${p.activityId}-${p.userId}`)
    );
    
    console.log(`📋 Found ${existingParticipants.length} existing participants`);
    
    const participants = [];
    const mockUsers = allUsers.slice(0, 6); // First 6 users are our mock users
    
    for (const activity of activitiesToUse.slice(0, 5)) { // First 5 activities
      // Add 3-4 participants per activity
      const participantCount = 3 + Math.floor(Math.random() * 2);
      const selectedUsers = mockUsers.slice(0, participantCount);
      
      for (const user of selectedUsers) {
        const participantKey = `${activity.id}-${user.id}`;
        
        if (!existingParticipantKeys.has(participantKey)) {
          participants.push({
            activityId: activity.id,
            userId: user.id,
            status: 'accepted' as const,
            team: Math.random() > 0.5 ? 'A' : 'B',
          });
        }
      }
    }
    
    if (participants.length > 0) {
      await db.insert(activityParticipants).values(participants);
      console.log(`✅ Added ${participants.length} new activity participants`);
    } else {
      console.log('ℹ️  All participants already exist');
    }
    
    console.log('🎉 Mock data creation completed!');
    
    // Summary
    const finalUsers = await db.select().from(users);
    const finalActivities = await db.select().from(activities);
    const finalParticipants = await db.select().from(activityParticipants);
    const finalELOs = await db.select().from(userActivityTypeELOs);
    
    console.log('\n📊 Final Database Summary:');
    console.log(`   - Total Users: ${finalUsers.length}`);
    console.log(`   - Total Activities: ${finalActivities.length}`);
    console.log(`   - Total Participants: ${finalParticipants.length}`);
    console.log(`   - Total ELO Records: ${finalELOs.length}`);
    console.log(`   - Total Activity Types: ${allActivityTypes.length}`);
    
  } catch (error) {
    console.error('❌ Mock data creation failed:', error);
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  createMockData()
    .then(() => {
      console.log('✅ Mock data creation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Mock data creation failed:', error);
      process.exit(1);
    });
}