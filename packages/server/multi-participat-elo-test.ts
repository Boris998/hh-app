// multi-participant-elo-test.ts - Test with 2+ participants for ELO

import 'dotenv/config';

const baseUrl = 'http://localhost:3001/api';

async function multiParticipantELOTest() {
  console.log('🏀 MULTI-PARTICIPANT ELO TEST\n');
  
  let authToken = '';
  let user1Id = '';
  let user2Id = '';
  let activityId = '';
  
  try {
    // Step 1: Login as first user
    console.log('1. 🔐 Authenticating as User 1...');
    const login1Response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });
    
    const login1Data = await login1Response.json();
    authToken = login1Data.data.tokens.accessToken;
    user1Id = login1Data.data.user.id;
    console.log(`   ✅ User 1: ${login1Data.data.user.username} (${user1Id})`);

    // Step 2: Get second user for testing
    console.log('\n2. 👥 Getting second user...');
    const { db } = await import('./src/db/client.js');
    const { users } = await import('./src/db/schema.js');
    const { ne } = await import('drizzle-orm');
    
    const otherUsers = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(ne(users.id, user1Id))
      .limit(3);
    
    if (otherUsers.length === 0) {
      throw new Error('Need at least 2 users in database for this test');
    }
    
    user2Id = otherUsers[0].id;
    console.log(`   ✅ User 2: ${otherUsers[0].username} (${user2Id})`);
    console.log(`   📊 Available users: ${otherUsers.length + 1}`);

    // Step 3: Create Basketball activity
    console.log('\n3. 🏀 Creating Basketball activity...');
    const typesResponse = await fetch(`${baseUrl}/activity-types`);
    const typesData = await typesResponse.json();
    const basketball = typesData.data.activityTypes.find((t: any) => t.name === 'Basketball');
    
    const activityData = {
      activityTypeId: basketball.id,
      description: 'Multi-Player ELO Test - Basketball 2v0',
      location: 'ELO Test Court',
      dateTime: new Date().toISOString(),
      maxParticipants: 4,
      isELORated: true
    };
    
    const createResponse = await fetch(`${baseUrl}/activities`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(activityData)
    });
    
    const createData = await createResponse.json();
    activityId = createData.data.activity.id;
    console.log(`   ✅ Activity created: ${activityId}`);

    // Step 4: Manually add second participant to database
    console.log('\n4. 👥 Adding second participant directly to database...');
    const { activityParticipants } = await import('./src/db/schema.js');
    
    await db.insert(activityParticipants).values({
      activityId: activityId,
      userId: user2Id,
      status: 'accepted',
      joinedAt: new Date()
    });
    
    console.log(`   ✅ Added User 2 as participant`);

    // Step 5: Verify participants
    console.log('\n5. 🔍 Verifying participants...');
    const { eq } = await import('drizzle-orm');
    
    const participants = await db
      .select()
      .from(activityParticipants)
      .where(eq(activityParticipants.activityId, activityId));
    
    console.log(`   📊 Total participants: ${participants.length}`);
    participants.forEach((p, i) => {
      console.log(`   👤 Participant ${i + 1}: ${p.userId} (${p.status})`);
    });

    // Step 6: Complete activity with 2 participant results
    console.log('\n6. 🏁 Completing activity with 2-participant results...');
    
    const completionData = {
      results: [
        {
          userId: user1Id,
          finalResult: 'win',
          performanceNotes: 'Player 1 dominated the game'
        },
        {
          userId: user2Id,
          finalResult: 'loss',
          performanceNotes: 'Player 2 played well but lost'
        }
      ],
      processELOImmediately: true
    };
    
    console.log(`   📊 Completion data:`);
    console.log(`      🏆 User 1 (${user1Id}): WIN`);
    console.log(`      😞 User 2 (${user2Id}): LOSS`);
    
    const completeResponse = await fetch(`${baseUrl}/activities/${activityId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completionData)
    });
    
    const completeData = await completeResponse.json();
    console.log(`   📊 Completion response:`, JSON.stringify(completeData, null, 4));

    // Step 7: Check ELO processing
    console.log('\n7. 🎯 Checking ELO processing...');
    
    const statusResponse = await fetch(`${baseUrl}/activities/${activityId}/elo-status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const statusData = await statusResponse.json();
    console.log(`   📊 ELO Status:`, JSON.stringify(statusData, null, 4));

    // Step 8: Check database for ELO records
    console.log('\n8. 🗄️  Checking ELO records in database...');
    
    const { activityELOStatus, userActivityTypeELOs } = await import('./src/db/schema.js');
    
    // Check ELO status
    const eloStatus = await db
      .select()
      .from(activityELOStatus)
      .where(eq(activityELOStatus.activityId, activityId))
      .limit(1);
    
    console.log(`   🎯 ELO Status in DB:`, eloStatus[0] || 'No record');
    
    // Check user ELO records
    const user1ELO = await db
      .select()
      .from(userActivityTypeELOs)
      .where(eq(userActivityTypeELOs.userId, user1Id));
    
    const user2ELO = await db
      .select()
      .from(userActivityTypeELOs)
      .where(eq(userActivityTypeELOs.userId, user2Id));
    
    console.log(`   📈 User 1 ELO records:`, user1ELO);
    console.log(`   📈 User 2 ELO records:`, user2ELO);

    // Step 9: Analysis
    console.log('\n📊 FINAL ANALYSIS:');
    console.log('='.repeat(60));
    
    if (completeData.data?.eloProcessing?.resultsCalculated) {
      console.log('🎉 SUCCESS! ELO processing worked with 2 participants!');
      console.log(`   📊 Participants affected: ${completeData.data.eloProcessing.participantsAffected}`);
      console.log(`   📈 Average ELO change: ${completeData.data.eloProcessing.averageELOChange}`);
      
      if (user1ELO.length > 0 || user2ELO.length > 0) {
        console.log('✅ ELO records created in database!');
      }
    } else if (completeData.data?.eloProcessing?.status === 'not_started') {
      console.log('❌ ELO still not triggered even with 2 participants');
      console.log('🔍 This indicates a code issue in the completion endpoint');
      console.log('💡 Check if eloProcessingService is properly imported and called');
    } else {
      console.log('⚠️  Unclear ELO state - check logs');
    }

  } catch (error) {
    console.error('💥 Multi-participant test failed:', error);
  }
}

// Run the test
multiParticipantELOTest();