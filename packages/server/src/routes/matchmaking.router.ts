// src/routes/matchmaking.router.ts - ELO-based Matchmaking API

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { matchmakingService } from '../services/matchmaking.service.js';
import { activities, activityParticipants, userActivityTypeELOs, userConnections, users } from '../db/schema.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export const matchmakingRouter = new Hono();

// Request schemas
const findPlayersSchema = z.object({
  activityTypeId: z.string().uuid('Invalid activity type ID'),
  eloTolerance: z.number().int().min(50).max(500).default(200),
  maxResults: z.number().int().min(1).max(50).default(10),
  skillRequirements: z.record(z.object({
    min: z.number().min(1).max(10),
    weight: z.number().min(0.1).max(2),
  })).optional(),
  includeConnections: z.boolean().default(true),
  avoidRecentOpponents: z.boolean().default(false),
});

const createOptimizedActivitySchema = z.object({
  activityTypeId: z.string().uuid('Invalid activity type ID'),
  description: z.string().min(1).max(1000),
  location: z.string().max(200),
  dateTime: z.string().pipe(z.coerce.date()),
  maxParticipants: z.number().int().min(2).max(50),
});

const balanceTeamsSchema = z.object({
  teamCount: z.number().int().min(2).max(8).default(2),
});

// POST /matchmaking/find-players - Find recommended players for an activity
matchmakingRouter.post('/find-players',
  authenticateToken,
  zValidator('json', findPlayersSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const criteria = c.req.valid('json');

      console.log(`🎯 Finding players for ${user.username} in activity type ${criteria.activityTypeId}`);

      // Get user's current ELO for this activity type
      const [userELO] = await db
        .select({ eloScore: userActivityTypeELOs.eloScore })
        .from(userActivityTypeELOs)
        .where(
          and(
            eq(userActivityTypeELOs.userId, user.id),
            eq(userActivityTypeELOs.activityTypeId, criteria.activityTypeId)
          )
        )
        .limit(1);

      if (!userELO) {
        return c.json({
          error: 'No ELO rating found for this activity type',
          suggestion: 'Complete at least one activity in this sport to get ELO-based recommendations',
        }, 400);
      }

      const matchmakingCriteria = {
        activityTypeId: criteria.activityTypeId,
        userELO: userELO.eloScore,
        eloTolerance: criteria.eloTolerance,
        skillRequirements: criteria.skillRequirements,
        maxParticipants: criteria.maxResults,
        includeConnections: criteria.includeConnections,
        avoidRecentOpponents: criteria.avoidRecentOpponents,
      };

      const recommendations = await matchmakingService.findRecommendedPlayers(
        user.id,
        matchmakingCriteria
      );

      // Calculate summary statistics
      const summary = {
        totalRecommendations: recommendations.length,
        averageELO: recommendations.length > 0 
          ? Math.round(recommendations.reduce((sum, r) => sum + r.currentELO, 0) / recommendations.length)
          : userELO.eloScore,
        eloRange: {
          min: Math.min(...recommendations.map(r => r.currentELO), userELO.eloScore),
          max: Math.max(...recommendations.map(r => r.currentELO), userELO.eloScore),
        },
        compatibilityBreakdown: {
          excellent: recommendations.filter(r => r.overallScore >= 85).length,
          good: recommendations.filter(r => r.overallScore >= 70 && r.overallScore < 85).length,
          fair: recommendations.filter(r => r.overallScore >= 50 && r.overallScore < 70).length,
          poor: recommendations.filter(r => r.overallScore < 50).length,
        },
        connections: recommendations.filter(r => r.connectionType === 'friend').length,
        newPlayers: recommendations.filter(r => r.connectionType === 'new').length,
      };

      return c.json({
        status: 'success',
        data: {
          userELO: userELO.eloScore,
          eloTolerance: criteria.eloTolerance,
          recommendations,
          summary,
        },
        message: `Found ${recommendations.length} player recommendations`,
      });

    } catch (error) {
      console.error('Error finding player recommendations:', error);
      return c.json({ error: 'Failed to find player recommendations' }, 500);
    }
  }
);

// GET /matchmaking/recommended-activities - Get activity recommendations for user
matchmakingRouter.get('/recommended-activities',
  authenticateToken,
  zValidator('query', z.object({
    activityTypeId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(15),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const { activityTypeId, limit } = c.req.valid('query');

      const recommendations = await matchmakingService.findRecommendedActivities(
        user.id,
        activityTypeId,
        limit
      );

      // Group recommendations by ELO compatibility tiers
      const tiers = {
        perfect: recommendations.filter(r => r.eloCompatibility >= 90),
        great: recommendations.filter(r => r.eloCompatibility >= 75 && r.eloCompatibility < 90),
        good: recommendations.filter(r => r.eloCompatibility >= 60 && r.eloCompatibility < 75),
        fair: recommendations.filter(r => r.eloCompatibility < 60),
      };

      const summary = {
        totalActivities: recommendations.length,
        availableToday: recommendations.filter(r => {
          const today = new Date();
          const activityDate = new Date(r.dateTime);
          return activityDate.toDateString() === today.toDateString();
        }).length,
        compatibilityTiers: {
          perfect: tiers.perfect.length,
          great: tiers.great.length,
          good: tiers.good.length,
          fair: tiers.fair.length,
        },
        activityTypes: [...new Set(recommendations.map(r => r.activityType.name))],
      };

      return c.json({
        status: 'success',
        data: {
          recommendations,
          summary,
          tiers,
        },
      });

    } catch (error) {
      console.error('Error getting activity recommendations:', error);
      return c.json({ error: 'Failed to get activity recommendations' }, 500);
    }
  }
);

// POST /matchmaking/create-optimized-activity - Create activity with optimal ELO targeting
matchmakingRouter.post('/create-optimized-activity',
  authenticateToken,
  zValidator('json', createOptimizedActivitySchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityData = c.req.valid('json');

      const result = await matchmakingService.createOptimizedActivity(
        user.id,
        activityData.activityTypeId,
        activityData.description,
        activityData.location,
        activityData.dateTime,
        activityData.maxParticipants
      );

      return c.json({
        status: 'success',
        data: {
          activity: {
            id: result.activityId,
            eloLevel: result.suggestedELOLevel,
            difficultyTier: result.difficultyTier,
            estimatedParticipants: result.estimatedParticipants,
          },
          optimization: {
            eloTargeting: `Activity set to ${result.suggestedELOLevel} ELO (${result.difficultyTier} level)`,
            participantPool: `${result.estimatedParticipants} potential participants in ELO range`,
            recommendations: result.estimatedParticipants < 5 
              ? ['Consider widening ELO tolerance', 'Try different time slots', 'Invite friends directly']
              : ['Great participant pool!', 'Activity should fill quickly'],
          },
        },
        message: `Created optimized ${result.difficultyTier} level activity`,
      }, 201);

    } catch (error) {
      console.error('Error creating optimized activity:', error);
      return c.json({ error: 'Failed to create optimized activity' }, 500);
    }
  }
);

// POST /matchmaking/balance-teams/:activityId - Balance teams for an activity
matchmakingRouter.post('/balance-teams/:activityId',
  authenticateToken,
  zValidator('json', balanceTeamsSchema),
  async (c) => {
    try {
      const activityId = c.req.param('activityId');
      const user = c.get('user');
      const { teamCount } = c.req.valid('json');

      // Verify user is the activity creator or admin
      const [activity] = await db
        .select({
          id: activities.id,
          creatorId: activities.creatorId,
        })
        .from(activities)
        .where(eq(activities.id, activityId))
        .limit(1);

      if (!activity) {
        return c.json({ error: 'Activity not found' }, 404);
      }

      if (activity.creatorId !== user.id && user.role !== 'admin') {
        return c.json({ 
          error: 'Only the activity creator or admin can balance teams' 
        }, 403);
      }

      const balanceResult = await matchmakingService.balanceTeams(activityId, teamCount);

      // Apply the team assignments to the database
      await db.transaction(async (tx) => {
        for (const [teamIndex, team] of balanceResult.teams.entries()) {
          const teamName = team.name;
          
          for (const player of team.players) {
            await tx
              .update(activityParticipants)
              .set({ team: teamName })
              .where(
                and(
                  eq(activityParticipants.activityId, activityId),
                  eq(activityParticipants.userId, player.userId)
                )
              );
          }
        }
      });

      return c.json({
        status: 'success',
        data: {
          balanceResult,
          applied: true,
          message: `Teams balanced with ${balanceResult.balanceScore}% balance score`,
        },
      });

    } catch (error) {
      console.error('Error balancing teams:', error);
      
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      
      return c.json({ error: 'Failed to balance teams' }, 500);
    }
  }
);

// GET /matchmaking/personalized-feed - Get personalized activity feed
matchmakingRouter.get('/personalized-feed',
  authenticateToken,
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(5).max(50).default(20),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const { limit } = c.req.valid('query');

      const feed = await matchmakingService.getPersonalizedActivityFeed(user.id, limit);

      // Calculate feed metrics
      const metrics = {
        recommendationsCount: feed.recommendedActivities.length,
        friendsActivityCount: feed.friendsActivities.length,
        trendingCount: feed.trendingActivities.length,
        totalUpcomingActivities: feed.recommendedActivities.length + feed.friendsActivities.length,
        averageELOLevel: feed.recommendedActivities.length > 0
          ? Math.round(feed.recommendedActivities.reduce((sum, a) => sum + a.eloLevel, 0) / feed.recommendedActivities.length)
          : 1200,
      };

      return c.json({
        status: 'success',
        data: {
          ...feed,
          metrics,
          generatedAt: new Date(),
        },
      });

    } catch (error) {
      console.error('Error generating personalized feed:', error);
      return c.json({ error: 'Failed to generate personalized feed' }, 500);
    }
  }
);

// GET /matchmaking/statistics - Get matchmaking system statistics (admin)
matchmakingRouter.get('/statistics',
  authenticateToken,
  async (c) => {
    try {
      const user = c.get('user');

      if (user.role !== 'admin') {
        return c.json({ error: 'Admin access required' }, 403);
      }

      const statistics = await matchmakingService.getMatchmakingStatistics();

      return c.json({
        status: 'success',
        data: { statistics },
      });

    } catch (error) {
      console.error('Error getting matchmaking statistics:', error);
      return c.json({ error: 'Failed to get statistics' }, 500);
    }
  }
);

// GET /matchmaking/preview-balance/:activityId - Preview team balance without applying
matchmakingRouter.get('/preview-balance/:activityId',
  authenticateToken,
  zValidator('query', z.object({
    teamCount: z.coerce.number().int().min(2).max(8).default(2),
  })),
  async (c) => {
    try {
      const activityId = c.req.param('activityId');
      const user = c.get('user');
      const { teamCount } = c.req.valid('query');

      // Verify user has access to view this activity
      const [activity] = await db
        .select({
          id: activities.id,
          creatorId: activities.creatorId,
        })
        .from(activities)
        .where(eq(activities.id, activityId))
        .limit(1);

      if (!activity) {
        return c.json({ error: 'Activity not found' }, 404);
      }

      // Check if user is participant, creator, or admin
      const [participation] = await db
        .select()
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, user.id)
          )
        )
        .limit(1);

      const hasAccess = participation || activity.creatorId === user.id || user.role === 'admin';
      
      if (!hasAccess) {
        return c.json({ error: 'Access denied' }, 403);
      }

      const balanceResult = await matchmakingService.balanceTeams(activityId, teamCount);

      return c.json({
        status: 'success',
        data: {
          preview: balanceResult,
          applied: false,
          canApply: activity.creatorId === user.id || user.role === 'admin',
          message: `Team balance preview: ${balanceResult.balanceScore}% balance score`,
        },
      });

    } catch (error) {
      console.error('Error previewing team balance:', error);
      
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      
      return c.json({ error: 'Failed to preview team balance' }, 500);
    }
  }
);

// POST /matchmaking/suggest-activity-time - Suggest optimal time for activity based on participant availability
matchmakingRouter.post('/suggest-activity-time',
  authenticateToken,
  zValidator('json', z.object({
    activityTypeId: z.string().uuid(),
    participantIds: z.array(z.string().uuid()).min(2).max(20),
    preferredDays: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).optional(),
    timeRange: z.object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    }).optional(),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const request = c.req.valid('json');

      console.log(`📅 Suggesting optimal time for ${request.participantIds.length} participants`);

      // This is a simplified implementation
      // In production, you'd analyze participant schedules, timezone preferences, etc.
      
      const suggestions = [
        {
          dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          confidence: 85,
          availableParticipants: request.participantIds.length - 1,
          reason: 'Most participants are typically available at this time',
        },
        {
          dateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
          confidence: 92,
          availableParticipants: request.participantIds.length,
          reason: 'All participants have good availability',
        },
        {
          dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
          confidence: 78,
          availableParticipants: Math.floor(request.participantIds.length * 0.8),
          reason: 'Weekend availability varies',
        },
      ];

      return c.json({
        status: 'success',
        data: {
          suggestions: suggestions.sort((a, b) => b.confidence - a.confidence),
          participantCount: request.participantIds.length,
          analysisNote: 'Time suggestions based on general availability patterns. Individual schedules not analyzed in this implementation.',
        },
      });

    } catch (error) {
      console.error('Error suggesting activity time:', error);
      return c.json({ error: 'Failed to suggest activity time' }, 500);
    }
  }
);

// GET /matchmaking/compatibility/:userId - Check compatibility with another user
matchmakingRouter.get('/compatibility/:userId',
  authenticateToken,
  zValidator('query', z.object({
    activityTypeId: z.string().uuid(),
  })),
  async (c) => {
    try {
      const targetUserId = c.req.param('userId');
      const user = c.get('user');
      const { activityTypeId } = c.req.valid('query');

      if (targetUserId === user.id) {
        return c.json({ error: 'Cannot check compatibility with yourself' }, 400);
      }

      // Get ELO for both users
      const userELOs = await db
        .select({
          userId: userActivityTypeELOs.userId,
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
        })
        .from(userActivityTypeELOs)
        .where(
          and(
            eq(userActivityTypeELOs.activityTypeId, activityTypeId),
            inArray(userActivityTypeELOs.userId, [user.id, targetUserId])
          )
        );

      const userELO = userELOs.find(elo => elo.userId === user.id);
      const targetELO = userELOs.find(elo => elo.userId === targetUserId);

      if (!userELO || !targetELO) {
        return c.json({ 
          error: 'ELO data not found for one or both users in this activity type' 
        }, 400);
      }

      // Calculate compatibility metrics
      const eloDifference = Math.abs(userELO.eloScore - targetELO.eloScore);
      const eloCompatibility = Math.max(0, 100 - (eloDifference / 200) * 100);

      // Estimate game outcomes
      const winProbability = 1 / (1 + Math.pow(10, (targetELO.eloScore - userELO.eloScore) / 400));
      
      // Get target user info
      const [targetUser] = await db
        .select({
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      // Check if they're connected
      const [connection] = await db
        .select()
        .from(userConnections)
        .where(
          and(
            eq(userConnections.status, 'accepted'),
            sql`(${userConnections.user1Id} = ${user.id} AND ${userConnections.user2Id} = ${targetUserId}) OR 
                (${userConnections.user1Id} = ${targetUserId} AND ${userConnections.user2Id} = ${user.id})`
          )
        )
        .limit(1);

      const compatibility = {
        eloCompatibility: Math.round(eloCompatibility),
        competitivenessLevel: eloDifference < 100 ? 'highly_competitive' : 
                             eloDifference < 200 ? 'competitive' : 
                             eloDifference < 400 ? 'moderately_competitive' : 'unbalanced',
        winProbability: Math.round(winProbability * 100),
        estimatedELOChange: {
          ifWin: Math.round(32 * (1 - winProbability)),
          ifLoss: Math.round(32 * (0 - winProbability)),
        },
        socialConnection: connection ? 'connected' : 'not_connected',
        recommendation: eloCompatibility > 75 ? 'excellent_match' :
                       eloCompatibility > 60 ? 'good_match' :
                       eloCompatibility > 40 ? 'fair_match' : 'poor_match',
      };

      return c.json({
        status: 'success',
        data: {
          targetUser: {
            username: targetUser?.username || 'Unknown',
            avatarUrl: targetUser?.avatarUrl,
          },
          yourELO: userELO.eloScore,
          theirELO: targetELO.eloScore,
          eloDifference,
          compatibility,
          matchAnalysis: {
            description: compatibility.recommendation === 'excellent_match' ? 
              'Perfect match! Very similar skill levels will lead to competitive games.' :
              compatibility.recommendation === 'good_match' ?
              'Good match. Games should be competitive with some back-and-forth.' :
              compatibility.recommendation === 'fair_match' ?
              'Fair match. One player may have a slight advantage.' :
              'Skill gap may lead to one-sided games. Consider team balancing.',
            gameQuality: compatibility.eloCompatibility,
          },
        },
      });

    } catch (error) {
      console.error('Error checking compatibility:', error);
      return c.json({ error: 'Failed to check compatibility' }, 500);
    }
  }
);

// GET /matchmaking/activity-insights/:activityId - Get insights about activity participants
matchmakingRouter.get('/activity-insights/:activityId',
  authenticateToken,
  async (c) => {
    try {
      const activityId = c.req.param('activityId');
      const user = c.get('user');

      // Verify user has access to view this activity
      const [activity] = await db
        .select({
          id: activities.id,
          creatorId: activities.creatorId,
          activityTypeId: activities.activityTypeId,
          eloLevel: activities.eloLevel,
        })
        .from(activities)
        .where(eq(activities.id, activityId))
        .limit(1);

      if (!activity) {
        return c.json({ error: 'Activity not found' }, 404);
      }

      // Check access
      const [participation] = await db
        .select()
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, user.id)
          )
        )
        .limit(1);

      const hasAccess = participation || activity.creatorId === user.id || user.role === 'admin';
      
      if (!hasAccess) {
        return c.json({ error: 'Access denied' }, 403);
      }

      // Get participant ELO data
      const participants = await db
        .select({
          user: users,
          elo: userActivityTypeELOs,
          participant: activityParticipants,
        })
        .from(activityParticipants)
        .leftJoin(users, eq(activityParticipants.userId, users.id))
        .leftJoin(userActivityTypeELOs, and(
          eq(userActivityTypeELOs.userId, activityParticipants.userId),
          eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
        ))
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, 'accepted')
          )
        );

      // Calculate insights
      const eloScores = participants.map(p => p.elo?.eloScore || 1200);
      const avgELO = eloScores.reduce((sum, elo) => sum + elo, 0) / eloScores.length;
      const minELO = Math.min(...eloScores);
      const maxELO = Math.max(...eloScores);
      const eloSpread = maxELO - minELO;

      // Calculate balance score
      const variance = eloScores.reduce((sum, elo) => sum + Math.pow(elo - avgELO, 2), 0) / eloScores.length;
      const balanceScore = Math.max(0, 100 - (variance / 100));

      // Team analysis if applicable
      let teamAnalysis = null;
      const teamsMap = new Map<string, typeof participants>();
      
      participants.forEach(p => {
        const team = p.participant.team || 'no_team';
        if (!teamsMap.has(team)) teamsMap.set(team, []);
        teamsMap.get(team)!.push(p);
      });

      if (teamsMap.size > 1 && !teamsMap.has('no_team')) {
        const teams = Array.from(teamsMap.entries()).map(([teamName, players]) => ({
          name: teamName,
          playerCount: players.length,
          averageELO: Math.round(players.reduce((sum, p) => sum + (p.elo?.eloScore || 1200), 0) / players.length),
          eloRange: {
            min: Math.min(...players.map(p => p.elo?.eloScore || 1200)),
            max: Math.max(...players.map(p => p.elo?.eloScore || 1200)),
          },
        }));

        const teamELOs = teams.map(t => t.averageELO);
        const teamBalance = Math.max(0, 100 - (Math.max(...teamELOs) - Math.min(...teamELOs)) * 2);

        teamAnalysis = {
          teams,
          teamBalance: Math.round(teamBalance),
          isBalanced: teamBalance > 75,
          recommendation: teamBalance > 85 ? 'Teams are excellently balanced' :
                         teamBalance > 70 ? 'Teams are well balanced' :
                         teamBalance > 50 ? 'Teams could use some balancing' :
                         'Teams are significantly unbalanced',
        };
      }

      const insights = {
        participantCount: participants.length,
        eloAnalysis: {
          average: Math.round(avgELO),
          minimum: minELO,
          maximum: maxELO,
          spread: eloSpread,
          activityELOLevel: activity.eloLevel || 1200,
          balanceScore: Math.round(balanceScore),
        },
        competitiveAnalysis: {
          skillLevel: avgELO < 1000 ? 'beginner' :
                     avgELO < 1400 ? 'intermediate' :
                     avgELO < 1800 ? 'advanced' : 'expert',
          competitiveness: eloSpread < 100 ? 'highly_competitive' :
                          eloSpread < 200 ? 'competitive' :
                          eloSpread < 400 ? 'moderately_competitive' : 'mixed_skill',
          gameQuality: balanceScore > 80 ? 'excellent' :
                      balanceScore > 60 ? 'good' :
                      balanceScore > 40 ? 'fair' : 'poor',
        },
        teamAnalysis,
        recommendations: [
          balanceScore < 60 ? 'Consider rebalancing participants for better games' : null,
          eloSpread > 300 ? 'Large skill gap detected - consider skill-based mentoring' : null,
          participants.length < 4 ? 'More participants would improve activity dynamics' : null,
          teamAnalysis && teamAnalysis.teamBalance < 70 ? 'Teams need rebalancing for fair competition' : null,
        ].filter(Boolean),
      };

      return c.json({
        status: 'success',
        data: { insights },
      });

    } catch (error) {
      console.error('Error getting activity insights:', error);
      return c.json({ error: 'Failed to get activity insights' }, 500);
    }
  }
);