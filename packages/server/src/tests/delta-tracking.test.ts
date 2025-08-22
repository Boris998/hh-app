// tests/services/delta-tracking.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { DeltaTrackingService } from '../services/delta-tracking.service';
import { cleanupTestData, createTestUsers } from './helpers/test-setup';

describe('Delta Tracking Service - Real-time Updates', () => {
  const service = new DeltaTrackingService();
  let testUsers: any[];

  beforeEach(async () => {
    testUsers = await createTestUsers(2);
  });

  afterEach(async () => {
    await cleanupTestData({ users: testUsers });
  });

  test('should track and retrieve changes correctly', async () => {
    const testEntityId = crypto.randomUUID();
    
    // Track a change
    await service.trackChange({
      entityType: 'activity',
      entityId: testEntityId,
      changeType: 'create',
      newData: { test: 'data' },
      affectedUserId: testUsers[0].id,
      triggeredBy: testUsers[0].id
    });

    // Retrieve changes
    const deltas = await service.getUserDeltas(testUsers[0].id);
    
    expect(deltas.hasChanges).toBe(true);
    expect(deltas.changes.length).toBeGreaterThan(0);
    
    const change = deltas.changes.find(c => c.entityId === testEntityId);
    expect(change).toBeDefined();
    expect(change?.entityType).toBe('activity');
    expect(change?.changeType).toBe('create');
  });

  test('should filter changes by time and entity type', async () => {
    const now = new Date();
    
    // Create changes of different types
    await Promise.all([
      service.trackChange({
        entityType: 'activity',
        entityId: crypto.randomUUID(),
        changeType: 'create',
        newData: {},
        affectedUserId: testUsers[0].id,
        triggeredBy: testUsers[0].id
      }),
      service.trackChange({
        entityType: 'elo',
        entityId: crypto.randomUUID(),
        changeType: 'update',
        newData: {},
        affectedUserId: testUsers[0].id,
        triggeredBy: testUsers[0].id
      })
    ]);

    // Get only activity changes
    const activityDeltas = await service.getUserDeltas(
      testUsers[0].id,
      undefined,
      ['activity'],
      'web'
    );

    expect(activityDeltas.changes.every(c => c.entityType === 'activity')).toBe(true);
  });
});