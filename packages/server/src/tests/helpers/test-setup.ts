
import { eq } from 'drizzle-orm';
import { activities, activityParticipants, activityTypes, skillDefinitions, userActivitySkillRatings, userActivityTypeELOs, users } from '../../db/schema';
import { db } from '../../db/client';

export async function createTestUsers(count: number) {
  const testUsers = [];
  for (let i = 0; i < count; i++) {
    const [user] = await db.insert(users).values({
      username: `test_user_${i}_${Date.now()}`,
      email: `test${i}_${Date.now()}@test.com`,
      role: 'user'
    }).returning();
    testUsers.push(user);
  }
  return testUsers;
}

export async function setupTestActivity(config: {
  activityType: string;
  participants: number;
  eloRatings: number[];
  teamBased: boolean;
  withSkills?: boolean;
}) {
  const users = await createTestUsers(config.participants);
  
  const [activityType] = await db.insert(activityTypes).values({
    id: crypto.randomUUID(),
    name: `Test ${config.activityType}`,
    category: 'team_sports',
    description: `Test ${config.activityType} for testing`,
    isSoloPerformable: false,
    defaultELOSettings: {
      startingELO: 1200,
      kFactor: { new: 32, established: 24, expert: 16 },
      provisionalGames: 20,
      minimumParticipants: config.participants,
      teamBased: config.teamBased,
      allowDraws: !config.teamBased,
      skillInfluence: 0.1
    }
  }).returning();

  // Set up ELO ratings
  await Promise.all(users.map((user, index) => 
    db.insert(userActivityTypeELOs).values({
    //   id: crypto.randomUUID(),
      userId: user.id,
      activityTypeId: activityType.id,
      eloScore: config.eloRatings[index] || 1200,
      gamesPlayed: 15,
      volatility: 0.1
    })
  ));

  const [activity] = await db.insert(activities).values({
    // id: crypto.randomUUID(),
    publicId: `test-${Date.now()}`,
    activityTypeId: activityType.id,
    creatorId: users[0].id,
    description: 'Test activity',
    location: 'Test Location',
    dateTime: new Date(Date.now() - 3600000),
    maxParticipants: config.participants,
    isELORated: true,
    completionStatus: 'completed'
  }).returning();

  // Add participants
  const participants = await Promise.all(users.map((user, index) => 
    db.insert(activityParticipants).values({
    //   id: crypto.randomUUID(),
      activityId: activity.id,
      userId: user.id,
      status: 'accepted',
      team: config.teamBased ? (index < config.participants / 2 ? 'A' : 'B') : undefined,
      finalResult: index === 0 ? 'win' : 'loss' // First user wins by default
    }).returning().then(([p]) => p)
  ));

  let skills:any = [];
  if (config.withSkills) {
    skills = await Promise.all([
      db.insert(skillDefinitions).values({
        name: 'Serve Accuracy',
        skillType: 'technical', // ✅ Valid enum value
        isGeneral: false,
        description: 'Precision in serving under pressure',
        ratingScaleMin: 1,
        ratingScaleMax: 10
      }).returning(),
      db.insert(skillDefinitions).values({
        name: 'Stamina',
        skillType: 'physical', // ✅ Valid enum value
        isGeneral: true,
        description: 'Endurance and cardiovascular fitness',
        ratingScaleMin: 1,
        ratingScaleMax: 10
      }).returning()
    ].map(p => p.then(([skill]) => skill)));
  }

  return {
    users,
    activityType,
    activity,
    participants,
    skills,
    skillRatings: userActivitySkillRatings // Table reference for test data
  };
}

export async function cleanupTestData(testData: any) {
  if (!testData) return;

  try {
    if (testData.activity) {
      await db.delete(userActivitySkillRatings)
        .where(eq(userActivitySkillRatings.activityId, testData.activity.id));
      await db.delete(activityParticipants)
        .where(eq(activityParticipants.activityId, testData.activity.id));
      await db.delete(activities)
        .where(eq(activities.id, testData.activity.id));
    }

    if (testData.skills?.length > 0) {
      for (const skill of testData.skills) {
        await db.delete(skillDefinitions).where(eq(skillDefinitions.id, skill.id));
      }
    }

    if (testData.activityType) {
      await db.delete(userActivityTypeELOs)
        .where(eq(userActivityTypeELOs.activityTypeId, testData.activityType.id));
      await db.delete(activityTypes)
        .where(eq(activityTypes.id, testData.activityType.id));
    }

    if (testData.users?.length > 0) {
      for (const user of testData.users) {
        await db.delete(users).where(eq(users.id, user.id));
      }
    }
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}