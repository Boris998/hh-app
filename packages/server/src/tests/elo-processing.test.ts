// tests/services/elo-processing.test.ts  
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { ELOProcessingService } from '../services/elo-processing.service';
import { cleanupTestData, setupTestActivity } from './helpers/test-setup';

describe('ELO Processing Service - Race Conditions & Locks', () => {
  const service = new ELOProcessingService();
  let testData: any;

  beforeEach(async () => {
    testData = await setupTestActivity({
      activityType: 'Basketball',
      participants: 4,
      eloRatings: [1400, 1350, 1300, 1250],
      teamBased: true
    });
  });

  afterEach(async () => {
    await cleanupTestData(testData);
  });

  test('should prevent concurrent processing of same activity', async () => {
    const completionData = {
      activityId: testData.activity.id,
      results: [
        { userId: testData.users[0].id, finalResult: 'win' as const },
        { userId: testData.users[1].id, finalResult: 'win' as const },
        { userId: testData.users[2].id, finalResult: 'loss' as const },
        { userId: testData.users[3].id, finalResult: 'loss' as const }
      ]
    };

    // Start first processing
    const firstProcess = service.onActivityCompletion(completionData);
    
    // Try concurrent processing - should be rejected
    await expect(service.onActivityCompletion(completionData))
      .rejects.toThrow('already in progress');

    // Wait for first to complete
    const result = await firstProcess;
    expect(result.success).toBe(true);
  });

  test('should handle ELO calculation errors gracefully', async () => {
    // Create invalid completion data (missing participant results)
    const invalidData = {
      activityId: testData.activity.id,
      results: [
        { userId: testData.users[0].id, finalResult: 'win' as const }
        // Missing other participants
      ]
    };

    const result = await service.onActivityCompletion(invalidData);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.participantsProcessed).toBe(0);
  });
});