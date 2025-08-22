// tests/integration/activity-completion-flow.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ELOProcessingService } from '../../services/elo-processing.service';
import { DeltaTrackingService } from '../../services/delta-tracking.service';
import { cleanupTestData, setupTestActivity } from '../helpers/test-setup';
import { db } from '../../db/client';
import { userActivityTypeELOs } from '../../db/schema';

describe('Complete Activity Completion Flow', () => {
  const eloService = new ELOProcessingService();
  const deltaService = new DeltaTrackingService();
  let testData: any;

  beforeEach(async () => {
    testData = await setupTestActivity({
      activityType: 'Tennis',
      participants: 2,
      eloRatings: [1400, 1200],
      teamBased: false,
      withSkills: true
    });
  });

  afterEach(async () => {
    await cleanupTestData(testData);
  });

  test('should complete full flow: activity → ELO → delta tracking', async () => {
    // 1. Complete activity with ELO processing
    const completionData = {
      activityId: testData.activity.id,
      results: [
        { userId: testData.users[0].id, finalResult: 'win' as const },
        { userId: testData.users[1].id, finalResult: 'loss' as const }
      ]
    };

    const eloResult = await eloService.onActivityCompletion(completionData);
    
    // Verify ELO processing succeeded
    expect(eloResult.success).toBe(true);
    expect(eloResult.participantsProcessed).toBe(2);
    expect(eloResult.eloChanges).toHaveLength(2);

    // 2. Verify ELO changes were persisted
    const updatedELOs = await db.select()
      .from(userActivityTypeELOs)
      .where(eq(userActivityTypeELOs.activityTypeId, testData.activityType.id));

    expect(updatedELOs).toHaveLength(2);
    
    const winnerELO = updatedELOs.find(e => e.userId === testData.users[0].id);
    const loserELO = updatedELOs.find(e => e.userId === testData.users[1].id);
    
    expect(winnerELO?.eloScore).toBeGreaterThan(1400);
    expect(loserELO?.eloScore).toBeLessThan(1200);

    // 3. Verify delta changes were tracked
    const winnerDeltas = await deltaService.getUserDeltas(testData.users[0].id);
    const loserDeltas = await deltaService.getUserDeltas(testData.users[1].id);

    expect(winnerDeltas.hasChanges).toBe(true);
    expect(loserDeltas.hasChanges).toBe(true);

    // Should have ELO update deltas
    const winnerELODelta = winnerDeltas.changes.find(c => c.entityType === 'elo');
    const loserELODelta = loserDeltas.changes.find(c => c.entityType === 'elo');

    expect(winnerELODelta).toBeDefined();
    expect(loserELODelta).toBeDefined();
  });

  test('should handle skill-influenced ELO calculations', async () => {
    // Add skill ratings that should influence ELO
    await db.insert(testData.skillRatings).values([
      {
        id: crypto.randomUUID(),
        activityId: testData.activity.id,
        ratedUserId: testData.users[0].id,
        ratingUserId: testData.users[1].id,
        skillDefinitionId: testData.skills[0].id,
        ratingValue: 9, // Excellent performance
        confidence: 8
      }
    ]);

    const completionData = {
      activityId: testData.activity.id,
      results: [
        { userId: testData.users[0].id, finalResult: 'win' as const },
        { userId: testData.users[1].id, finalResult: 'loss' as const }
      ]
    };

    const result = await eloService.onActivityCompletion(completionData);
    
    expect(result.success).toBe(true);
    
    // Winner should have skill bonus applied
    const winnerChange = result.eloChanges.find(c => c.userId === testData.users[0].id);
    expect(winnerChange?.change).toBeGreaterThan(10); // Base + skill bonus
  });
});