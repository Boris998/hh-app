// tests/routers/delta-polling.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { DeltaTrackingService } from '../../src/services/delta-tracking.service.js';
import { signJWT } from '../../src/auth/jwt.js';
import { cleanupTestData, createTestUsers } from './helpers/test-setup.js';
import { testApp } from './helpers/test-app.js';

describe('Delta Router - Polling Functionality', () => {
  const deltaService = new DeltaTrackingService();
  let testUsers: any[];
  let authToken: string;

  beforeEach(async () => {
    testUsers = await createTestUsers(1);
    authToken = await signJWT({
      id: testUsers[0].id,
      username: testUsers[0].username,
      email: testUsers[0].email,
      role: testUsers[0].role
    });
  });

  afterEach(async () => {
    await cleanupTestData({ users: testUsers });
  });

  test('should provide efficient delta polling with proper headers', async () => {
    // Create some changes to poll
    await deltaService.trackChange({
      entityType: 'activity',
      entityId: crypto.randomUUID(),
      changeType: 'create',
      newData: { test: 'polling' },
      affectedUserId: testUsers[0].id,
      triggeredBy: testUsers[0].id
    });

    const response = await testApp.request('/api/delta/changes', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.status).toBe(200);
    
    // Check polling-specific headers
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(response.headers.get('X-Poll-Interval')).toBeDefined();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.changes).toBeInstanceOf(Array);
    expect(data.data.recommendedPollInterval).toBeGreaterThan(0);
    expect(data.metadata.recommendedNextPoll).toBeDefined();
  });

  test('should handle incremental polling correctly', async () => {
    const now = new Date();
    
    // First poll - should get initial state
    const firstResponse = await testApp.request('/api/delta/changes', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const firstData = await firstResponse.json();
    const firstTimestamp = firstData.metadata.timestamp;

    // Add new change after first poll
    await deltaService.trackChange({
      entityType: 'elo',
      entityId: crypto.randomUUID(),
      changeType: 'update',
      newData: { eloScore: 1450 },
      affectedUserId: testUsers[0].id,
      triggeredBy: testUsers[0].id
    });

    // Second poll with timestamp filter
    const secondResponse = await testApp.request(`/api/delta/changes?since=${firstTimestamp}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const secondData = await secondResponse.json();
    
    // Should only get changes after first poll
    expect(secondData.data.changes.length).toBeLessThanOrEqual(firstData.data.changes.length);
    expect(secondData.data.changes.some((c:any) => c.entityType === 'elo')).toBe(true);
  });
});