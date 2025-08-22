// tests/services/elo-calculation.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { ELOCalculationService, type ELOCalculationResult } from '../services/elo-calc.service';
import { cleanupTestData, setupTestActivity } from './helpers/test-setup';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';

describe('ELO Calculation Service - Core Logic', () => {
  const service = new ELOCalculationService();
  let testData: any;

  beforeEach(async () => {
    testData = await setupTestActivity({
      activityType: 'Tennis',
      participants: 2,
      eloRatings: [1400, 1200], // Higher vs Lower rated
      teamBased: false
    });
  });

  afterEach(async () => {
    await cleanupTestData(testData);
  });

  test('should calculate basic 1v1 ELO correctly', async () => {
    // Higher rated player (1400) beats lower rated (1200)
    const results = await service.calculateActivityELO(testData.activity.id);

    const winner = results.find((r): r is ELOCalculationResult => r.userId === testData.users[0].id);
    const loser = results.find(
      (r): r is ELOCalculationResult => r.userId === testData.users[1].id
    );

    expect(winner).toBeDefined();
    expect(loser).toBeDefined();

    if (!winner || !loser) {
      throw new Error('Winner or loser not found in ELO results');
    }

    expect(winner?.newELO).toBeGreaterThan(winner?.oldELO);
    expect(loser?.newELO).toBeLessThan(loser?.oldELO);
    
    // Higher rated should gain fewer points when winning
    expect(winner?.eloChange).toBeLessThan(20);
    expect(winner?.eloChange).toBeGreaterThan(5);
  });

  test('should handle upset victories correctly', async () => {
    // Simulate upset: lower rated player wins
    await db.update(testData.participants)
      .set({ finalResult: 'loss' })
      .where(eq(testData.participants.userId, testData.users[0].id));
      
    await db.update(testData.participants)
      .set({ finalResult: 'win' })
      .where(eq(testData.participants.userId, testData.users[1].id));

    const results = await service.calculateActivityELO(testData.activity.id);
    
    const upsetWinner = results.find(r => r.userId === testData.users[1].id);
    const upsetLoser = results.find(r => r.userId === testData.users[0].id);

    // Lower rated player should gain more points for upset
    expect(upsetWinner?.eloChange).toBeGreaterThan(25);
    expect(upsetLoser?.eloChange).toBeLessThan(-15);
  });
});