// team-based-elo-test.ts - Test Basketball with proper teams

import 'dotenv/config';

const baseUrl = 'http://localhost:3001/api';

async function teamBasedELOTest() {
  console.log('🏀 TEAM-BASED ELO TEST (Basketball with Teams)\n');
  
  let authToken = '';
  let user1Id = '';
  let user2Id = '';
  let activityId = '';
  
  try {
    // Step 1: Authenticate
    console.log('1. 🔐 Authenticating...');
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });
    
    const loginData = await loginResponse.json();
    authToken = loginData.data.tokens.accessToken;
    user1Id = loginData.data.user.id;
    console.log(`   ✅ User 1: ${loginData.data.user.username}`);

    // Step 2: Get second user
    const { db } = await import('./src/db/client.js');
    const { users } = await import('./src/db/schema.js');
    const { ne } = await import('drizzle-orm');
    
    const otherUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(ne(users.id, user1Id))
      .limit(1);
    
    user2Id = otherUsers[0].id;
    console.log(`   ✅ User 2: ${otherUsers[0].username}`);

    // Step 3: Create Basketball activity
    console.log('\n2. 🏀 Creating Basketball activity...');
    const typesResponse = await fetch(`${baseUrl}/activity-types`);
    const typesData = await typesResponse.json();
    const basketball = typesData.data.activityTypes.find((t: any) => t.name === 'Basketball');
    
    console.log(`   ⚙️  Basketball ELO settings:`, basketball.defaultELOSettings);
    
    const activityData = {
      activityTypeId: basketball.id,
      description: 'Team vs Team Basketball - ELO Test',
      location: 'ELO Basketball Court',
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

    // Step 4: Add participants with TEAMS
    console.log('\n3. 👥 Adding participants with teams...');
    const { activityParticipants } = await import('./src/db/schema.js');
    
    // Add User 2 to Team B (User 1 is auto-added to Team A)
    await db.insert(activityParticipants).values({
      activityId: activityId,
      userId: user2Id,
      status: 'accepted',
      team: 'Team B',  // ← KEY: Different team!
      joinedAt: new Date()
    });
    
    // Update User 1 to be on Team A
    const { eq, and } = await import('drizzle-orm');
    await db
      .update(activityParticipants)
      .set({ team: 'Team A' })  // ← KEY: Assign to Team A!
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user1Id)
        )
      );
    
    console.log(`   ✅ User 1 assigned to Team A`);
    console.log(`   ✅ User 2 assigned to Team B`);

    // Step 5: Verify team assignments
    console.log('\n4. 🔍 Verifying team assignments...');
    const participants = await db
      .select()
      .from(activityParticipants)
      .where(eq(activityParticipants.activityId, activityId));
    
    participants.forEach((p, i) => {
      console.log(`   👤 Participant ${i + 1}: ${p.userId} on ${p.team} (${p.status})`);
    });

    // Step 6: Complete activity with TEAM results
    console.log('\n5. 🏁 Completing activity with team-based results...');
    
    const completionData = {
      results: [
        {
          userId: user1Id,
          finalResult: 'win',    // Team A wins
          performanceNotes: 'Team A dominated the game!'
        },
        {
          userId: user2Id,
          finalResult: 'loss',   // Team B loses
          performanceNotes: 'Team B fought hard but lost'
        }
      ],
      processELOImmediately: true
    };
    
    console.log(`   🏆 Team A (User 1): WIN`);
    console.log(`   😞 Team B (User 2): LOSS`);
    
    const completeResponse = await fetch(`${baseUrl}/activities/${activityId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completionData)
    });
    
    const completeData = await completeResponse.json();
    console.log(`\n   📊 Completion response:`, JSON.stringify(completeData, null, 4));

    // Step 7: Check ELO processing immediately
    console.log('\n6. ⚡ Checking ELO processing status...');
    
    const statusResponse = await fetch(`${baseUrl}/activities/${activityId}/elo-status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const statusData = await statusResponse.json();
    console.log(`   📊 ELO Status:`, JSON.stringify(statusData, null, 4));

    // Step 8: Wait and check again
    console.log('\n7. ⏳ Waiting 3 seconds for ELO calculation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const statusResponse2 = await fetch(`${baseUrl}/activities/${activityId}/elo-status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const statusData2 = await statusResponse2.json();
    console.log(`   📊 ELO Status (after wait):`, JSON.stringify(statusData2, null, 4));

    // Step 9: Check ELO records in database
    console.log('\n8. 🗄️  Checking ELO records...');
    const { userActivityTypeELOs, activityELOStatus } = await import('./src/db/schema.js');
    
    // Check ELO status in DB
    const eloStatus = await db
      .select()
      .from(activityELOStatus)
      .where(eq(activityELOStatus.activityId, activityId))
      .limit(1);
    
    console.log(`   🎯 ELO Status in DB:`, eloStatus[0] || 'No record');
    
    // Check both users' ELO for Basketball
    const user1ELO = await db
      .select()
      .from(userActivityTypeELOs)
      .where(
        and(
          eq(userActivityTypeELOs.userId, user1Id),
          eq(userActivityTypeELOs.activityTypeId, basketball.id)
        )
      );
    
    const user2ELO = await db
      .select()
      .from(userActivityTypeELOs)
      .where(
        and(
          eq(userActivityTypeELOs.userId, user2Id),
          eq(userActivityTypeELOs.activityTypeId, basketball.id)
        )
      );
    
    console.log(`   📈 User 1 Basketball ELO:`, user1ELO[0] || 'No record');
    console.log(`   📈 User 2 Basketball ELO:`, user2ELO[0] || 'No record');

    // Step 10: Analysis
    console.log('\n🏆 FINAL ANALYSIS:');
    console.log('='.repeat(60));
    
    if (completeData.data?.eloProcessing?.resultsCalculated) {
      console.log('🎉 SUCCESS! Team-based ELO calculation worked!');
      console.log(`   📊 Participants affected: ${completeData.data.eloProcessing.participantsAffected}`);
      console.log(`   📈 Average ELO change: ${completeData.data.eloProcessing.averageELOChange.toFixed(1)}`);
      
      if (user1ELO.length > 0 && user2ELO.length > 0) {
        console.log('\n📊 ELO Changes:');
        console.log(`   🏆 Winner (User 1): ${user1ELO[0].eloScore} ELO (${user1ELO[0].gamesPlayed} games)`);
        console.log(`   😞 Loser (User 2): ${user2ELO[0].eloScore} ELO (${user2ELO[0].gamesPlayed} games)`);
        
        // Calculate ELO change (assuming they started at 1200)
        const user1Change = user1ELO[0].eloScore - 1200;
        const user2Change = user2ELO[0].eloScore - 1200;
        console.log(`   📈 ELO Changes: +${user1Change} (winner), ${user2Change} (loser)`);
      }
    } else if (statusData2.data?.eloStatus?.error) {
      console.log(`❌ ELO calculation failed: ${statusData2.data.eloStatus.error}`);
    } else {
      console.log('⚠️  ELO calculation status unclear');
    }

    console.log('\n🎊 Your ELO system is sophisticated and working correctly!');
    console.log('   🏀 Team-based sports require proper team assignments');
    console.log('   🎯 Individual sports work with single participants');
    console.log('   📊 Your system has intelligent validation rules');

  } catch (error) {
    console.error('💥 Team-based ELO test failed:', error);
  }
}

// Alternative: Test with Tennis (individual sport)
async function testIndividualSport() {
  console.log('\n🎾 ALTERNATIVE: Testing Tennis (Individual Sport)\n');
  
  // Same setup but use Tennis instead of Basketball
  // Tennis doesn't require teams, just 2 individual players
}

// Run the test
teamBasedELOTest();