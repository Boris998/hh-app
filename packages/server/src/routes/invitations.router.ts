// src/routes/invitations.router.ts - Complete fix
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../db/client.js';
import { activityParticipants, activities, users, activityTypes } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

const invitationsRouter = new Hono();

// Validation schemas
const respondToInvitationSchema = z.object({
  response: z.enum(['accept', 'decline']),
  message: z.string().max(500).optional(),
});

// GET /invitations - Get user invitations (pending activity invites)
invitationsRouter.get('/', authenticateToken, async (c) => {
  const user = c.get('user');
  
  try {
    console.log(`📬 Fetching invitations for user: ${user.username}`);
    
    // Fetch pending invitations with activity details
    const invitations = await db
      .select({
        id: activityParticipants.id,
        activityId: activityParticipants.activityId,
        status: activityParticipants.status,
        team: activityParticipants.team,
        joinedAt: activityParticipants.joinedAt,
        activity: {
          id: activities.id,
          publicId: activities.publicId,
          description: activities.description,
          dateTime: activities.dateTime,
          location: activities.location,
          maxParticipants: activities.maxParticipants,
          eloLevel: activities.eloLevel,
        },
        activityType: {
          id: activityTypes.id,
          name: activityTypes.name,
        },
        creator: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        }
      })
      .from(activityParticipants)
      .innerJoin(activities, eq(activityParticipants.activityId, activities.id))
      .innerJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .innerJoin(users, eq(activities.creatorId, users.id))
      .where(
        and(
          eq(activityParticipants.userId, user.id),
          eq(activityParticipants.status, 'pending'),
          // Only include future activities
          sql`${activities.dateTime} > NOW()`
        )
      )
      .orderBy(desc(activities.dateTime))
      .execute();
    
    return c.json({
      success: true,
      data: invitations.map(inv => ({
        id: inv.id,
        activityId: inv.activityId,
        status: inv.status,
        team: inv.team,
        invitedAt: inv.joinedAt?.toISOString() || null,
        activity: {
          ...inv.activity,
          dateTime: inv.activity.dateTime?.toISOString() || null,
        },
        activityType: inv.activityType,
        creator: inv.creator,
      })),
      count: invitations.length,
    });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch invitations',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /invitations/:id/respond - Respond to invitation
invitationsRouter.post(
  '/:id/respond',
  zValidator('json', respondToInvitationSchema),
  authenticateToken,
  async (c) => {
    const user = c.get('user');
    const invitationId = c.req.param('id');
    const { response, message } = c.req.valid('json');
    
    try {
      console.log(`📬 User ${user.username} responding to invitation ${invitationId}: ${response}`);
      
      // Find the invitation
      const invitation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.id, invitationId),
          eq(activityParticipants.userId, user.id),
          eq(activityParticipants.status, 'pending')
        ),
        with: {
          activity: true,
        }
      });
      
      if (!invitation) {
        return c.json({
          success: false,
          error: 'Invitation not found or already responded',
        }, 404);
      }
      
      // Check if activity is still in the future
      if (invitation.activity.dateTime && invitation.activity.dateTime <= new Date()) {
        return c.json({
          success: false,
          error: 'Cannot respond to invitation for past activity',
        }, 400);
      }
      
      // Update invitation status
      const newStatus = response === 'accept' ? 'accepted' : 'declined';
      
      const [updatedInvitation] = await db
        .update(activityParticipants)
        .set({
          status: newStatus,
          performanceNotes: message,
        })
        .where(eq(activityParticipants.id, invitationId))
        .returning();
      
      return c.json({
        success: true,
        data: {
          id: updatedInvitation.id,
          status: updatedInvitation.status,
          activityId: updatedInvitation.activityId,
        },
        message: `Invitation ${response}ed successfully`,
      });
    } catch (error) {
      console.error('Error responding to invitation:', error);
      return c.json({
        success: false,
        error: 'Failed to respond to invitation',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  }
);

export default invitationsRouter;
