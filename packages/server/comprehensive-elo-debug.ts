// comprehensive-elo-debug.ts - Debug exactly what's happening with ELO

import 'dotenv/config';

const baseUrl = 'http://localhost:3001/api';

async function comprehensiveELODebug() {
  console.log('🔍 COMPREHENSIVE ELO DEBUG TEST\n');
  
  let authToken = '';
  let userId = '';
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
    userId = loginData.data.user.id;
    console.log(`   ✅ Authenticated as ${loginData.data.user.username}`);
    console.log(`   🆔 User ID: ${userId}`);

    // Step 2: Get Basketball activity type
    console.log('\n2. 🏀 Getting Basketball activity type...');
    const typesResponse = await fetch(`${baseUrl}/activity-types`);
    const typesData = await typesResponse.json();
    const basketball = typesData.data.activityTypes.find((t: any) => t.name === 'Basketball');
    
    console.log(`   ✅ Found Basketball activity type`);
    console.log(`   🎯 ID: ${basketball.id}`);
    console.log(`   ⚙️  ELO Settings:`, JSON.stringify(basketball.defaultELOSettings, null, 4));

    // Step 3: Create activity with detailed logging
    console.log('\n3. 🎯 Creating test activity...');
    const activityData = {
      activityTypeId: basketball.id,
      description: 'Debug ELO Test - Basketball Match',
      location: 'Debug Court',
      dateTime: new Date().toISOString(),
      maxParticipants: 2,
      isELORated: true
    };
    
    console.log(`   📊 Activity data:`, JSON.stringify(activityData, null, 4));
    
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
    
    console.log(`   ✅ Activity created`);
    console.log(`   🆔 Activity ID: ${activityId}`);
    console.log(`   📊 Full response:`, JSON.stringify(createData, null, 4));

    // Step 4: Check activity details before completion
    console.log('\n4. 🔍 Checking activity before completion...');
    const activityResponse = await fetch(`${baseUrl}/activities/${activityId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const activityDetails = await activityResponse.json();
    console.log(`   📊 Activity details:`, JSON.stringify(activityDetails.data, null, 4));

    // Step 5: Complete activity with maximum logging
    console.log('\n5. 🏁 Completing activity with detailed logging...');
    
    const completionData = {
      results: [
        {
          userId: userId,
          finalResult: 'win',
          performanceNotes: 'Excellent ELO debug test performance'
        }
      ],
      processELOImmediately: true
    };
    
    console.log(`   📊 Completion data:`, JSON.stringify(completionData, null, 4));
    console.log(`   🚀 Making completion request...`);
    
    const completeResponse = await fetch(`${baseUrl}/activities/${activityId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completionData)
    });
    
    console.log(`   📡 Response status: ${completeResponse.status}`);
    console.log(`   📡 Response headers:`, Object.fromEntries(completeResponse.headers.entries()));
    
    const completeData = await completeResponse.json();
    console.log(`   📊 COMPLETE RESPONSE:`, JSON.stringify(completeData, null, 4));

    // Step 6: Immediately check ELO status
    console.log('\n6. ⚡ Immediately checking ELO status...');
    
    const statusResponse = await fetch(`${baseUrl}/activities/${activityId}/elo-status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const statusData = await statusResponse.json();
    console.log(`   📊 ELO STATUS:`, JSON.stringify(statusData, null, 4));

    // Step 7: Wait and check again
    console.log('\n7. ⏳ Waiting 3 seconds and checking ELO status again...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const statusResponse2 = await fetch(`${baseUrl}/activities/${activityId}/elo-status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const statusData2 = await statusResponse2.json();
    console.log(`   📊 ELO STATUS (after wait):`, JSON.stringify(statusData2, null, 4));

    // Step 8: Check if we can trigger ELO manually (if admin endpoint exists)
    console.log('\n8. 🔧 Attempting manual ELO recalculation...');
    
    try {
      const manualResponse = await fetch(`${baseUrl}/activities/${activityId}/recalculate-elo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (manualResponse.ok) {
        const manualData = await manualResponse.json();
        console.log(`   ✅ Manual ELO calculation:`, JSON.stringify(manualData, null, 4));
      } else {
        console.log(`   ⚠️  Manual ELO calculation failed: ${manualResponse.status}`);
        const errorText = await manualResponse.text();
        console.log(`   📄 Error:`, errorText);
      }
    } catch (error) {
      console.log(`   ⚠️  Manual ELO endpoint not available or failed:`, error);
    }

    // Step 9: Database state check (if possible)
    console.log('\n9. 🗄️  Checking database state...');
    
    try {
      // Import database client if available
      const { db } = await import('./src/db/client.js');
      const { activityELOStatus, userActivityTypeELOs, activities, activityParticipants } = await import('./src/db/schema.js');
      const { eq } = await import('drizzle-orm');
      
      // Check activity status
      const activityStatus = await db
        .select()
        .from(activities)
        .where(eq(activities.id, activityId))
        .limit(1);
      
      console.log(`   📊 Activity in database:`, activityStatus[0]);
      
      // Check participants
      const participants = await db
        .select()
        .from(activityParticipants)
        .where(eq(activityParticipants.activityId, activityId));
      
      console.log(`   👥 Participants:`, participants);
      
      // Check ELO status
      const eloStatus = await db
        .select()
        .from(activityELOStatus)
        .where(eq(activityELOStatus.activityId, activityId))
        .limit(1);
      
      console.log(`   🎯 ELO Status in DB:`, eloStatus[0] || 'No ELO status record');
      
      // Check user ELO records
      const userELO = await db
        .select()
        .from(userActivityTypeELOs)
        .where(eq(userActivityTypeELOs.userId, userId))
        .limit(5);
      
      console.log(`   📈 User ELO records:`, userELO);
      
    } catch (dbError) {
      console.log(`   ⚠️  Database check failed:`, dbError);
    }

    // Step 10: Analysis
    console.log('\n📊 ANALYSIS:');
    console.log('='.repeat(60));
    
    if (completeData.data?.eloProcessing?.resultsCalculated) {
      console.log('✅ ELO processing appears to have worked!');
    } else if (completeData.data?.eloProcessing?.status === 'not_started') {
      console.log('❌ ELO processing was not triggered');
      console.log('💡 Possible issues:');
      console.log('   - ELO service not imported in activities router');
      console.log('   - ELO service method not called');
      console.log('   - Activity not eligible for ELO (check validation)');
      console.log('   - Error in ELO calculation (check logs)');
    } else {
      console.log('⚠️  Unclear ELO processing state');
    }
    
    console.log('\n📋 Next steps:');
    console.log('1. Check server logs for ELO processing messages');
    console.log('2. Verify enhanced-activities.router.ts imports eloProcessingService');
    console.log('3. Add debug logging to ELO service calls');
    console.log('4. Test with minimum 2 participants if required');

  } catch (error) {
    console.error('💥 Debug test failed:', error);
  }
}

// Run the debug test
comprehensiveELODebug();