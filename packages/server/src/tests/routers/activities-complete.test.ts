// tests/routers/activities-complete.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { cleanupTestData, setupTestActivity } from '../helpers/test-setup';
import { signJWT } from '../../auth/jwt';
import { testApp } from '../helpers/test-app';

describe('Activities Router - Complete Flow', () => {
  let testData: any;
  let authToken: string;

  beforeEach(async () => {
    testData = await setupTestActivity({
      activityType: 'Basketball',
      participants: 4,
      eloRatings: [1400, 1350, 1300, 1250],
      teamBased: true
    });

    authToken = await signJWT({
      id: testData.users[0].id,
      username: testData.users[0].username,
      email: testData.users[0].email,
      role: testData.users[0].role
    });
  });

  afterEach(async () => {
    await cleanupTestData(testData);
  });

  test('should complete activity with team-based ELO processing', async () => {
    const completionData = {
      participantResults: [
        { userId: testData.users[0].id, finalResult: 'win', team: 'A' },
        { userId: testData.users[1].id, finalResult: 'win', team: 'A' },
        { userId: testData.users[2].id, finalResult: 'loss', team: 'B' },
        { userId: testData.users[3].id, finalResult: 'loss', team: 'B' }
      ],
      completionNotes: 'Great game, Team A won 21-15'
    };

    const response = await testApp.request(`/api/activities/${testData.activity.id}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(completionData)
    });

    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.activity.completionStatus).toBe('completed');
    expect(data.data.eloProcessing).toBeDefined();
    expect(data.data.eloProcessing.participantsAffected).toBe(4);
  });

  test('should prevent non-creator from completing activity', async () => {
    // Use different user token
    const nonCreatorToken = await signJWT({
      id: testData.users[1].id,
      username: testData.users[1].username,
      email: testData.users[1].email,
      role: testData.users[1].role
    });

    const response = await testApp.request(`/api/activities/${testData.activity.id}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nonCreatorToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        participantResults: [
          { userId: testData.users[0].id, finalResult: 'win' }
        ]
      })
    });

    expect(response.status).toBe(404); // Not found because not creator
  });
});