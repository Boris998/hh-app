// Update debug test with proper UUID:
import { deltaTrackingService } from './src/services/delta-tracking.service.js';

async function testDeltaLogging() {
  console.log('🔍 Testing delta logging with fixed schema...');
  
  try {
    await deltaTrackingService.logChange({
      entityType: 'activity',
      entityId: 'dd363cc7-304f-49a6-9280-c39b83d7359e', // Valid UUID
      changeType: 'create',
      affectedUserId: 'dd363cc7-304f-49a6-9280-c39b83d7359e',
      newData: { test: 'data' },
      triggeredBy: 'dd363cc7-304f-49a6-9280-c39b83d7359e'
    });
    
    console.log('✅ Delta logging works!');
  } catch (error) {
    console.error('❌ Delta logging failed:', error);
  }
}

testDeltaLogging();