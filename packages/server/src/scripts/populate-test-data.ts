// scripts/populate-test-data.ts
import "dotenv/config";

import { eq,and } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "../db/client.js";
import {
  activities,
  activityChatMessages,
  activityChatRooms,
  activityParticipants,
  activityTypes,
  chatRooms,
  deltaSummaries,
  entityChangeLog,
  messages,
  roomMembers,
  skillDefinitions,
  skillTypeEnum,
  teamMembers,
  teams,
  userActivitySkillRatings,
  userActivityTypeELOs,
  userActivityTypeSkillSummaries,
  userConnections,
  users,
} from "../db/schema.js";
import { userDeltaCursors } from "../db/delta-tracking.schema.js";

interface PopulationStats {
  users: number;
  activityTypes: number;
  skillDefinitions: number;
  activities: number;
  teams: number;
  connections: number;
  chatRooms: number;
  messages: number;
  eloRecords: number;
  skillRatings: number;
  deltaChanges: number;
}

export class DatabasePopulator {
  private stats: PopulationStats = {
    users: 0,
    activityTypes: 0,
    skillDefinitions: 0,
    activities: 0,
    teams: 0,
    connections: 0,
    chatRooms: 0,
    messages: 0,
    eloRecords: 0,
    skillRatings: 0,
    deltaChanges: 0,
  };

  private createdUsers: any[] = [];
  private createdActivityTypes: any[] = [];
  private createdSkills: any[] = [];
  private createdActivities: any[] = [];
  private createdTeams: any[] = [];

  async populateAll(): Promise<PopulationStats> {
    console.log("🚀 Starting comprehensive database population...\n");

    try {
      await this.createUsers();
      await this.createActivityTypes();
      await this.createSkillDefinitions();
      await this.createTeams();
      await this.createUserConnections();
      await this.createActivities();
      await this.assignParticipants();
      await this.createInitialELOs();
      await this.completeActivities();
      await this.createSkillRatings();
      await this.createSkillSummaries();
      await this.createChatSystem();
      await this.createDeltaTracking();

      this.printStats();
      return this.stats;
    } catch (error) {
      console.error("❌ Population failed:", error);
      throw error;
    }
  }

  private async createUsers() {
    console.log("👥 Creating users...");

    const existingUsers = await db.select({ email: users.email }).from(users);
    const existingEmails = new Set(existingUsers.map((u) => u.email));

    const userData = [
      { username: "alice_tennis", email: "alice@example.com", role: "user" },
      { username: "bob_basketball", email: "bob@example.com", role: "user" },
      {
        username: "charlie_soccer",
        email: "charlie@example.com",
        role: "user",
      },
      {
        username: "diana_volleyball",
        email: "diana@example.com",
        role: "user",
      },
      { username: "ethan_running", email: "ethan@example.com", role: "user" },
      { username: "fiona_yoga", email: "fiona@example.com", role: "user" },
      {
        username: "george_swimming",
        email: "george@example.com",
        role: "user",
      },
      { username: "hannah_cycling", email: "hannah@example.com", role: "user" },
      { username: "ian_boxing", email: "ian@example.com", role: "user" },
      { username: "julia_climbing", email: "julia@example.com", role: "user" },
      { username: "admin_user", email: "admin@example.com", role: "admin" },
    ];

    // Filter out users that already exist
    const newUsers = userData.filter((user) => !existingEmails.has(user.email));

    if (newUsers.length === 0) {
      console.log("ℹ️  All users already exist, loading existing users...");
      // Load existing users into createdUsers array
      this.createdUsers = await db.select().from(users);
      this.stats.users = this.createdUsers.length;
      return;
    }

    const passwordHash = await hash("1_Pass@hH-app", 10);

    for (const user of newUsers) {
      const [createdUser] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          publicId: crypto.randomUUID(),
          username: user.username,
          email: user.email,
          passwordHash,
          role: user.role as "user" | "admin",
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      this.createdUsers.push(createdUser);
    }

    // Load all existing users if we only created some
    if (newUsers.length < userData.length) {
      this.createdUsers = await db.select().from(users);
    }

    this.stats.users = this.createdUsers.length;
    console.log(`✅ Created ${this.stats.users} users`);
  }

  private async createActivityTypes() {
    console.log("🏃 Creating activity types with ELO settings...");

    // Check existing activity types
    const existingTypes = await db
      .select({ name: activityTypes.name })
      .from(activityTypes);
    const existingNames = new Set(existingTypes.map((at) => at.name));

    const activityTypesData = [
      {
        name: "Tennis",
        description: "Singles and doubles tennis matches",
        isSoloPerformable: false,
        defaultELOSettings: {
          startingELO: 1200,
          kFactor: { new: 32, established: 24, expert: 16 },
          provisionalGames: 20,
          minimumParticipants: 2,
          teamBased: false,
          allowDraws: true,
          skillInfluence: 0.1,
        },
        skillCategories: {
          technical: ["Forehand", "Backhand", "Serve", "Volley"],
          physical: ["Speed", "Endurance", "Agility"],
          mental: ["Focus", "Strategy"],
        },
      },
      {
        name: "Basketball",
        description: "5v5 basketball games",
        isSoloPerformable: false,
        defaultELOSettings: {
          startingELO: 1200,
          kFactor: { new: 36, established: 28, expert: 20 },
          provisionalGames: 15,
          minimumParticipants: 4,
          teamBased: true,
          allowDraws: false,
          skillInfluence: 0.15,
        },
        skillCategories: {
          technical: ["Shooting", "Dribbling", "Passing", "Defense"],
          physical: ["Speed", "Jumping", "Strength"],
          mental: ["Court Vision", "Decision Making"],
        },
      },
      {
        name: "Soccer",
        description: "Football/soccer matches",
        isSoloPerformable: false,
        defaultELOSettings: {
          startingELO: 1200,
          kFactor: { new: 30, established: 22, expert: 14 },
          provisionalGames: 25,
          minimumParticipants: 6,
          teamBased: true,
          allowDraws: true,
          skillInfluence: 0.12,
        },
        skillCategories: {
          technical: ["Ball Control", "Passing", "Shooting", "Tackling"],
          physical: ["Speed", "Endurance", "Strength"],
          mental: ["Game Reading", "Positioning"],
        },
      },
      {
        name: "Running",
        description: "Individual and group runs",
        isSoloPerformable: true,
        defaultELOSettings: {
          startingELO: 1200,
          kFactor: { new: 28, established: 20, expert: 12 },
          provisionalGames: 30,
          minimumParticipants: 1,
          teamBased: false,
          allowDraws: false,
          skillInfluence: 0.05,
        },
        skillCategories: {
          physical: ["Endurance", "Speed", "Pacing"],
          mental: ["Mental Toughness", "Focus"],
        },
      },
      {
        name: "Volleyball",
        description: "Beach and indoor volleyball",
        isSoloPerformable: false,
        defaultELOSettings: {
          startingELO: 1200,
          kFactor: { new: 34, established: 26, expert: 18 },
          provisionalGames: 18,
          minimumParticipants: 4,
          teamBased: true,
          allowDraws: false,
          skillInfluence: 0.13,
        },
        skillCategories: {
          technical: ["Serving", "Spiking", "Blocking", "Setting"],
          physical: ["Jumping", "Agility", "Coordination"],
          mental: ["Timing", "Communication"],
        },
      },
    ];

    const newActivityTypes = activityTypesData.filter(
      (at) => !existingNames.has(at.name)
    );

    if (newActivityTypes.length === 0) {
      console.log("ℹ️  All activity types already exist, loading existing...");
      this.createdActivityTypes = await db.select().from(activityTypes);
      this.stats.activityTypes = this.createdActivityTypes.length;
      return;
    }

    for (const activityType of newActivityTypes) {
      const [created] = await db
        .insert(activityTypes)
        .values({
          id: crypto.randomUUID(),
          name: activityType.name,
          description: activityType.description,
          category: "fitness",
          isSoloPerformable: activityType.isSoloPerformable,
          defaultELOSettings: activityType.defaultELOSettings,
          skillCategories: activityType.skillCategories,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      this.createdActivityTypes.push(created);
    }

    // Load all existing if we only created some
    if (newActivityTypes.length < activityTypesData.length) {
      this.createdActivityTypes = await db.select().from(activityTypes);
    }

    this.stats.activityTypes = this.createdActivityTypes.length;
    console.log(
      `✅ Created ${newActivityTypes.length} new activity types, total: ${this.stats.activityTypes}`
    );
  }

  private async createSkillDefinitions() {
    console.log("🎯 Creating skill definitions...");

    // Check for existing skills first
    const existingSkills = await db
      .select({ skillType: skillDefinitions.skillType })
      .from(skillDefinitions);
    const existingSkillNames = new Set(existingSkills.map((s) => s.skillType));

    const skillsData = [
      // --- General Skills (apply to multiple sports) ---
      { name: "Speed", skillType: "physical", isGeneral: true },
      { name: "Endurance", skillType: "physical", isGeneral: true },
      { name: "Agility", skillType: "physical", isGeneral: true },
      { name: "Strength", skillType: "physical", isGeneral: true },
      { name: "Coordination", skillType: "physical", isGeneral: true },
      { name: "Flexibility", skillType: "physical", isGeneral: true },
      { name: "Balance", skillType: "physical", isGeneral: true },

      { name: "Focus", skillType: "mental", isGeneral: true },
      { name: "Mental Toughness", skillType: "mental", isGeneral: true },
      { name: "Concentration", skillType: "mental", isGeneral: true },
      { name: "Composure", skillType: "mental", isGeneral: true },
      { name: "Visualization", skillType: "mental", isGeneral: true },
      { name: "Strategy", skillType: "mental", isGeneral: true },
      { name: "Decision Making", skillType: "mental", isGeneral: true },
      { name: "Anticipation", skillType: "mental", isGeneral: true },

      { name: "Technique", skillType: "technical", isGeneral: true },
      { name: "Timing", skillType: "technical", isGeneral: true },
      { name: "Accuracy", skillType: "technical", isGeneral: true },
      { name: "Precision", skillType: "technical", isGeneral: true },

      // --- Sport-Specific Skills ---
      // --- Tennis ---
      { name: "Forehand", skillType: "technical", isGeneral: false },
      { name: "Backhand", skillType: "technical", isGeneral: false },
      { name: "Serve", skillType: "technical", isGeneral: false },
      { name: "Volley", skillType: "technical", isGeneral: false },
      { name: "Smash", skillType: "technical", isGeneral: false },
      { name: "Drop Shot", skillType: "technical", isGeneral: false },
      { name: "Lob", skillType: "technical", isGeneral: false },
      { name: "Return of Serve", skillType: "technical", isGeneral: false },
      { name: "Footwork", skillType: "technical", isGeneral: false }, // Often considered technical
      { name: "Court Coverage", skillType: "physical", isGeneral: false }, // Physical aspect
      { name: "Shot Selection", skillType: "mental", isGeneral: false }, // Mental aspect

      // --- Basketball ---
      { name: "Shooting", skillType: "technical", isGeneral: false },
      { name: "Dribbling", skillType: "technical", isGeneral: false },
      { name: "Passing", skillType: "technical", isGeneral: false },
      { name: "Defense", skillType: "technical", isGeneral: false },
      { name: "Rebounding", skillType: "physical", isGeneral: false },
      { name: "Jumping", skillType: "physical", isGeneral: false },
      { name: "Court Vision", skillType: "mental", isGeneral: false },
      { name: "Screening", skillType: "technical", isGeneral: false }, // Physical/Technical mix, leaning Technical
      { name: "Fast Break", skillType: "tactical", isGeneral: false },

      // --- Soccer/Football ---
      { name: "Ball Control", skillType: "technical", isGeneral: false },
      { name: "Soccer Passing", skillType: "technical", isGeneral: false },
      { name: "Soccer Shooting", skillType: "technical", isGeneral: false },
      { name: "Tackling", skillType: "technical", isGeneral: false },
      { name: "Heading", skillType: "physical", isGeneral: false },
      { name: "Dribbling (Soccer)", skillType: "technical", isGeneral: false },
      { name: "Crossing", skillType: "technical", isGeneral: false },
      { name: "First Touch", skillType: "technical", isGeneral: false },
      { name: "Game Reading", skillType: "mental", isGeneral: false },
      { name: "Positioning", skillType: "mental", isGeneral: false },
      { name: "Set Pieces", skillType: "technical", isGeneral: false },
      { name: "Marking", skillType: "technical", isGeneral: false }, // Defensive tactic/technique

      // --- Volleyball ---
      { name: "Volleyball Serving", skillType: "technical", isGeneral: false },
      { name: "Spiking", skillType: "technical", isGeneral: false },
      { name: "Blocking", skillType: "technical", isGeneral: false },
      { name: "Setting", skillType: "technical", isGeneral: false },
      { name: "Digging", skillType: "technical", isGeneral: false },
      { name: "Receiving Serve", skillType: "technical", isGeneral: false },
      { name: "Communication", skillType: "mental", isGeneral: false }, // Crucial for team coordination

      // --- Running ---
      { name: "Pacing", skillType: "technical", isGeneral: false }, // Often involves technique
      { name: "Running Form", skillType: "technical", isGeneral: false },
      { name: "Cadence", skillType: "technical", isGeneral: false },
      { name: "Stride Length", skillType: "technical", isGeneral: false },

      // --- Swimming ---
      { name: "Stroke Technique", skillType: "technical", isGeneral: false },
      { name: "Breathing", skillType: "technical", isGeneral: false },
      { name: "Starts", skillType: "technical", isGeneral: false },
      { name: "Turns", skillType: "technical", isGeneral: false },
      { name: "Streamlining", skillType: "technical", isGeneral: false },

      // --- Cycling ---
      { name: "Climbing", skillType: "physical", isGeneral: false },
      { name: "Sprinting (Cycling)", skillType: "physical", isGeneral: false },
      { name: "Cornering", skillType: "technical", isGeneral: false },
      { name: "Pacing (Cycling)", skillType: "mental", isGeneral: false }, // Tactical/mental

      // --- Martial Arts / Combat Sports ---
      { name: "Striking", skillType: "technical", isGeneral: false },
      { name: "Grappling", skillType: "technical", isGeneral: false },
      { name: "Blocking", skillType: "technical", isGeneral: false }, // Different context from Volleyball
      { name: "Dodging", skillType: "physical", isGeneral: false },
      { name: "Counter-Attacking", skillType: "tactical", isGeneral: false },
      { name: "Distance Management", skillType: "tactical", isGeneral: false },
      { name: "Rhythm", skillType: "mental", isGeneral: false }, // Mental timing

      // --- Team Sports (General Tactics) ---
      { name: "Communication", skillType: "mental", isGeneral: false }, // Emphasize team aspect
      { name: "Teamwork", skillType: "mental", isGeneral: false },
      { name: "Leadership", skillType: "mental", isGeneral: false },
      { name: "Adaptability", skillType: "mental", isGeneral: false },
      { name: "Play Execution", skillType: "tactical", isGeneral: false },
      { name: "Defensive Formation", skillType: "tactical", isGeneral: false },
      { name: "Offensive Formation", skillType: "tactical", isGeneral: false },
    ];

    const validSkillTypes = skillTypeEnum.enumValues; // ["physical", "technical", "mental", "tactical"]

    // Clear the array to hold created skills
    this.createdSkills = [];

    const newSkills = skillsData.filter(
      (skill: any) => !existingSkillNames.has(skill.skillType)
    );

    if (newSkills.length === 0) {
      console.log(
        "ℹ️  All skill definitions already exist, loading existing..."
      );
      this.createdSkills = await db.select().from(skillDefinitions);
      this.stats.skillDefinitions = this.createdSkills.length;
      return;
    }

    console.log(`📝 Creating ${newSkills.length} new skill definitions...`);

    for (const skill of newSkills) {
      // Validate skillType against the enum
      if (!validSkillTypes.includes(skill.skillType as any)) {
        console.error(
          `Invalid skillType provided for skill '${skill.name}': ${skill.skillType}`
        );
        continue;
      }

      try {
        const [created] = await db
          .insert(skillDefinitions)
          .values({
            name: skill.name,
            skillType:
              skill.skillType as (typeof skillTypeEnum.enumValues)[number],
            isGeneral: skill.isGeneral,
            description: `The ${skill.name} skill, categorized as ${skill.skillType}.`,
          })
          .returning();

        this.createdSkills.push(created);
      } catch (err: any) {
        if (err?.code === "23505" && err?.constraint?.includes("name")) {
          console.warn(
            `⚠️ Skill definition '${skill.name}' already exists, skipping.`
          );
        } else {
          console.error(
            `❌ Error creating skill definition '${skill.name}':`,
            err
          );
        }
      }
    }

    this.stats.skillDefinitions = this.createdSkills.length;
    console.log(`✅ Created ${this.stats.skillDefinitions} skill definitions`);
  }

  private async createTeams() {
    console.log("🏀 Creating teams...");

    const teamsData = [
      {
        name: "Thunder Bolts",
        description: "Competitive basketball team",
        logoUrl: "https://api.dicebear.com/7.x/shapes/svg?seed=thunderbolts",
      },
      {
        name: "Soccer Stars",
        description: "Local soccer team",
        logoUrl: "https://api.dicebear.com/7.x/shapes/svg?seed=soccerstars",
      },
      {
        name: "Net Warriors",
        description: "Volleyball champions",
        logoUrl: "https://api.dicebear.com/7.x/shapes/svg?seed=netwarriors",
      },
      {
        name: "Court Masters",
        description: "Tennis doubles specialists",
        logoUrl: "https://api.dicebear.com/7.x/shapes/svg?seed=courtmasters",
      },
    ];
    const creator =
      this.createdUsers[Math.floor(Math.random() * this.createdUsers.length)];

    for (const team of teamsData) {
      const [created] = await db
        .insert(teams)
        .values({
          name: team.name,
          description: team.description,
          creatorId: creator.id,
        })
        .returning();

      this.createdTeams.push(created);

      // Add 2-3 members to each team
      const memberCount = 2 + Math.floor(Math.random() * 2);
      const teamMemberUsers = this.createdUsers
        .filter((u) => u.role === "user")
        .sort(() => 0.5 - Math.random())
        .slice(0, memberCount);

      for (let i = 0; i < teamMemberUsers.length; i++) {
        await db.insert(teamMembers).values({
          id: crypto.randomUUID(),
          teamId: created.id,
          userId: teamMemberUsers[i].id,
          role: i === 0 ? "captain" : "member",
          joinedAt: new Date(),
        });
      }
    }

    this.stats.teams = this.createdTeams.length;
    console.log(`✅ Created ${this.stats.teams} teams with members`);
  }

  private async createUserConnections() {
    console.log("🤝 Creating user connections...");

    const regularUsers = this.createdUsers.filter((u) => u.role === "user");
    let connectionCount = 0;

    // Create random connections between users
    for (let i = 0; i < regularUsers.length; i++) {
      const connectionsToCreate = 2 + Math.floor(Math.random() * 3);
      const potentialConnections = regularUsers.filter(
        (_, index) => index !== i
      );

      for (
        let j = 0;
        j < Math.min(connectionsToCreate, potentialConnections.length);
        j++
      ) {
        const friend = potentialConnections[j];

        // Check if connection already exists
        const existing = await db
          .select()
          .from(userConnections)
          .where(eq(userConnections.user1Id, regularUsers[i].id));

        const alreadyConnected = existing.some(
          (c: any) => c.user2Id === friend.id || c.user1Id === friend.id
        );

        if (!alreadyConnected) {
          await db.insert(userConnections).values({
            id: crypto.randomUUID(),
            user1Id: regularUsers[i].id,
            user2Id: friend.id,
            status: Math.random() > 0.2 ? "accepted" : "pending",
            createdAt: new Date(),
          });
          connectionCount++;
        }
      }
    }

    this.stats.connections = connectionCount;
    console.log(`✅ Created ${this.stats.connections} user connections`);
  }

  private async createActivities() {
    console.log("🏃 Creating activities...");

    const activitiesData = [
      {
        description: "Morning tennis singles match",
        location: "Central Tennis Club",
        activityTypeId: this.createdActivityTypes.find(
          (at) => at.name === "Tennis"
        )?.id,
        maxParticipants: 2,
        dateTime: new Date(Date.now() - 86400000 * 2), // 2 days ago
        isELORated: true,
      },
      {
        description: "Evening basketball pickup game",
        location: "Community Center Court",
        activityTypeId: this.createdActivityTypes.find(
          (at) => at.name === "Basketball"
        )?.id,
        maxParticipants: 10,
        dateTime: new Date(Date.now() - 86400000 * 1), // 1 day ago
        isELORated: true,
      },
      {
        description: "Weekend soccer match",
        location: "City Park Field",
        activityTypeId: this.createdActivityTypes.find(
          (at) => at.name === "Soccer"
        )?.id,
        maxParticipants: 12,
        dateTime: new Date(Date.now() - 86400000 * 3), // 3 days ago
        isELORated: true,
      },
      {
        description: "Morning 5K run",
        location: "Riverside Trail",
        activityTypeId: this.createdActivityTypes.find(
          (at) => at.name === "Running"
        )?.id,
        maxParticipants: 20,
        dateTime: new Date(Date.now() - 86400000 * 1), // 1 day ago
        isELORated: true,
      },
      {
        description: "Beach volleyball tournament",
        location: "Sandy Beach Courts",
        activityTypeId: this.createdActivityTypes.find(
          (at) => at.name === "Volleyball"
        )?.id,
        maxParticipants: 8,
        dateTime: new Date(Date.now() - 86400000 * 4), // 4 days ago
        isELORated: true,
      },
      // Future activities
      {
        description: "Advanced tennis doubles",
        location: "Elite Tennis Academy",
        activityTypeId: this.createdActivityTypes.find(
          (at) => at.name === "Tennis"
        )?.id,
        maxParticipants: 4,
        dateTime: new Date(Date.now() + 86400000 * 2), // 2 days from now
        isELORated: true,
      },
      {
        description: "Friday night basketball",
        location: "High School Gym",
        activityTypeId: this.createdActivityTypes.find(
          (at) => at.name === "Basketball"
        )?.id,
        maxParticipants: 10,
        dateTime: new Date(Date.now() + 86400000 * 3), // 3 days from now
        isELORated: true,
      },
    ];

    for (const activityData of activitiesData) {
      const creator =
        this.createdUsers[Math.floor(Math.random() * this.createdUsers.length)];

      const [created] = await db
        .insert(activities)
        .values({
          activityTypeId: activityData.activityTypeId!,
          creatorId: creator.id,
          description: activityData.description,
          location: activityData.location,
          dateTime: activityData.dateTime,
          maxParticipants: Math.floor(activityData.maxParticipants),
          eloLevel: Math.floor(1200 + Math.random() * 400), // 1200-1600 range
          isELORated: activityData.isELORated,
          completionStatus:
            activityData.dateTime < new Date() ? "completed" : "scheduled",
        })
        .returning();

      this.createdActivities.push(created);
    }

    this.stats.activities = this.createdActivities.length;
    console.log(`✅ Created ${this.stats.activities} activities`);
  }

  private async assignParticipants() {
    console.log("👥 Assigning participants to activities...");

    for (const activity of this.createdActivities) {
      const activityType = this.createdActivityTypes.find(
        (at) => at.id === activity.activityTypeId
      );
      const participantCount = Math.min(
        Math.floor(
          (activity.maxParticipants || 10) * (0.6 + Math.random() * 0.4)
        ),
        this.createdUsers.length
      );

      // Ensure creator is always a participant
      const participants = [
        this.createdUsers.find((u) => u.id === activity.creatorId),
      ];

      // Add random participants
      const availableUsers = this.createdUsers
        .filter((u) => u.id !== activity.creatorId && u.role === "user")
        .sort(() => 0.5 - Math.random())
        .slice(0, participantCount - 1);

      participants.push(...availableUsers);

      // Assign participants
      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        const team = activityType?.defaultELOSettings?.teamBased
          ? i < participants.length / 2
            ? "A"
            : "B"
          : null;

        let finalResult: "win" | "loss" | "draw" | null = null;
        if (activity.completionStatus === "completed") {
          if (activityType?.defaultELOSettings?.teamBased) {
            finalResult = team === "A" ? "win" : "loss";
          } else {
            finalResult = i === 0 ? "win" : "loss";
          }
        }

        await db.insert(activityParticipants).values({
          activityId: activity.id,
          userId: participant.id,
          status: "accepted",
          team,
          finalResult,
          joinedAt: new Date(
            activity.createdAt.getTime() + Math.floor(Math.random() * 3600000)
          ),
        });
      }
    }

    console.log("✅ Assigned participants to all activities");
  }

  private async createInitialELOs() {
    console.log("📊 Creating initial ELO ratings...");

    const existingELOs = await db
      .select({
        userId: userActivityTypeELOs.userId,
        activityTypeId: userActivityTypeELOs.activityTypeId,
      })
      .from(userActivityTypeELOs);

    const existingCombinations = new Set(
      existingELOs.map((elo) => `${elo.userId}-${elo.activityTypeId}`)
    );

    let eloCount = 0;
    const regularUsers = this.createdUsers.filter((u) => u.role === "user");

    for (const user of regularUsers) {
      for (const activityType of this.createdActivityTypes) {
        // Only create ELO if user has participated in this activity type
        const combination = `${user.id}-${activityType.id}`;

        if (existingCombinations.has(combination)) {
          console.log(
            `⚠️  ELO record already exists for ${user.username} - ${activityType.name}`
          );
          continue;
        }
        const hasParticipated = await db
          .select()
          .from(activityParticipants)
          .innerJoin(
            activities,
            eq(activities.id, activityParticipants.activityId)
          )
          .where(eq(activityParticipants.userId, user.id))
          .limit(1);

        if (hasParticipated.length > 0) {
          const startingELO =
            activityType.defaultELOSettings?.startingELO || 1200;
          const variation = Math.floor(Math.random() * 300) - 150; // ±150 variation

          await db.insert(userActivityTypeELOs).values({
            id: crypto.randomUUID(),
            userId: user.id,
            activityTypeId: activityType.id,
            eloScore: Math.max(800, startingELO + variation),
            gamesPlayed: 5 + Math.floor(Math.random() * 20),
            volatility: Math.floor(350 + Math.random() * 100),
            lastUpdated: new Date(),
          });
          eloCount++;
        }
      }
    }

    this.stats.eloRecords = eloCount;
    console.log(`✅ Created ${this.stats.eloRecords} ELO records`);
  }

  private async completeActivities() {
    console.log("🏁 Completing past activities...");

    const completedActivities = this.createdActivities.filter(
      (a) => a.completionStatus === "completed"
    );

    for (const activity of completedActivities) {
      await db
        .update(activities)
        .set({
          completionStatus: "completed",
          //   completedAt: new Date(), // 2 hours after start
          updatedAt: new Date(),
        })
        .where(eq(activities.id, activity.id));
    }

    console.log(
      `✅ Marked ${completedActivities.length} activities as completed`
    );
  }

  private async createSkillRatings() {
    console.log("⭐ Creating skill ratings...");

    const completedActivities = this.createdActivities
      .filter((a) => a.completionStatus === "completed")
      .slice(0, 5);

    let ratingCount = 0;

    for (const activity of completedActivities) {
      const participants = await db
        .select()
        .from(activityParticipants)
        .where(eq(activityParticipants.activityId, activity.id));

      // Get relevant skills for this activity type
      const relevantSkills = this.createdSkills
        .filter(
          (skill) => skill.isGeneral || Math.random() > 0.7 // Include some sport-specific skills
        )
        .slice(0, 5); // Limit to 5 skills per activity

      // Each participant rates others
      for (const rater of participants.slice(0, 5)) {
        const otherParticipants = participants.filter(
          (p: any) => p.userId !== rater.userId
        );

        for (const rated of otherParticipants.slice(0, 5)) {
          for (const skill of relevantSkills.slice(0, 5)) {
            if (Math.random() > 0.3) {
              // 70% chance to rate each skill
              await db.insert(userActivitySkillRatings).values({
                id: crypto.randomUUID(),
                activityId: activity.id,
                ratedUserId: rated.userId,
                ratingUserId: rater.userId,
                skillDefinitionId: skill.id,
                ratingValue: Math.floor(Math.random() * 6) + 5, // 5-10 rating
                confidence: Math.floor(Math.random() * 5) + 6, // 6-10 confidence
                comment: Math.random() > 0.7 ? "Great performance!" : null,
                isAnonymous: Math.random() > 0.8,
                createdAt: new Date(activity.completedAt || activity.dateTime),
              });
              ratingCount++;
            }
          }
        }
      }
    }

    this.stats.skillRatings = ratingCount;
    console.log(`✅ Created ${this.stats.skillRatings} skill ratings`);
  }

  private async createSkillSummaries() {
    console.log("📈 Creating skill summaries...");

    const regularUsers = this.createdUsers
      .filter((u) => u.role === "user")
      .slice(0, 5);

    // Check for existing summaries first
    const existingSummaries = await db
      .select({
        userId: userActivityTypeSkillSummaries.userId,
        activityTypeId: userActivityTypeSkillSummaries.activityTypeId,
        skillDefinitionId: userActivityTypeSkillSummaries.skillDefinitionId,
      })
      .from(userActivityTypeSkillSummaries);

    const existingCombinations = new Set(
      existingSummaries.map(
        (s) => `${s.userId}-${s.activityTypeId}-${s.skillDefinitionId}`
      )
    );

    let summaryCount = 0;

    for (const user of regularUsers.slice(0, 5)) {
      for (const activityType of this.createdActivityTypes.slice(0, 5)) {
        for (const skill of this.createdSkills.slice(0, 8)) {
          const combination = `${user.id}-${activityType.id}-${skill.id}`;

          // Skip if already exists
          if (existingCombinations.has(combination)) {
            continue;
          }
          // Limit for performance
          // Check if user has ratings for this skill in this activity type
          try {
          // Check if user has ratings for this skill in this activity type
          const ratings = await db.select({
            ratingValue: userActivitySkillRatings.ratingValue
          })
            .from(userActivitySkillRatings)
            .innerJoin(activities, eq(activities.id, userActivitySkillRatings.activityId))
            .where(and(
              eq(userActivitySkillRatings.ratedUserId, user.id),
              eq(userActivitySkillRatings.skillDefinitionId, skill.id),
              eq(activities.activityTypeId, activityType.id)
            ))
            .limit(10); // Limit to reduce query load

          if (ratings.length > 0) {
            const avgRating = ratings.reduce((sum, r) => sum + r.ratingValue, 0) / ratings.length;
            
            await db.insert(userActivityTypeSkillSummaries).values({
              userId: user.id,
              activityTypeId: activityType.id,
              skillDefinitionId: skill.id,
              averageRating: Math.round(avgRating * 10) / 10,
              totalRatings: ratings.length,
              lastCalculatedAt: new Date()
            });
            
            summaryCount++;
          }

          // Add small delay to prevent overwhelming the connection
          if (summaryCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          console.log(`⚠️  Error creating summary for ${user.username}: ${error}`);
          // Continue with next iteration instead of failing
          continue;
        }
        }
      }
    }

    console.log("✅ Created skill summaries");
  }

  private async createChatSystem() {
    console.log("💬 Creating chat system...");

    let chatRoomCount = 0;
    let messageCount = 0;

    const generalRoomCreatorId =
      this.createdUsers.length > 0 ? this.createdUsers[0].id : null;

    if (!generalRoomCreatorId) {
      console.warn("⚠️ No users available to create general chat rooms.");
    } else {
      const generalRooms = [
        {
          name: "General Discussion",
          description: "Talk about anything sports-related",
          isPrivate: false,
        },
        {
          name: "Tennis Players",
          description: "Tennis enthusiasts chat",
          isPrivate: false,
        },
        {
          name: "Basketball Squad",
          description: "Basketball players unite",
          isPrivate: false,
        },
      ];

      // Create general chat rooms

      for (const roomData of generalRooms.slice(0, 5)) {
        const [room] = await db
          .insert(chatRooms)
          .values({
            //   id: crypto.randomUUID(),
            name: roomData.name,
            description: roomData.description,
            isPrivate: roomData.isPrivate,
            creatorId: generalRoomCreatorId,
          })
          .returning();

        chatRoomCount++;

        // Add 5-8 members to each room
        const memberCount = 5 + Math.floor(Math.random() * 4);
        const selectedMembers = this.createdUsers
          .filter((u) => u.role === "user")
          .sort(() => 0.5 - Math.random())
          .slice(0, memberCount);

        for (let i = 0; i < selectedMembers.length; i++) {
          await db.insert(roomMembers).values({
            //   id: crypto.randomUUID(),
            roomId: room.id,
            userId: selectedMembers[i].id,
            isAdmin: i === 0,
            joinedAt: new Date(Date.now() - Math.random() * 86400000 * 7), // Within last week
          });

          // Create 2-5 messages per member
          const messagesPerMember = 2 + Math.floor(Math.random() * 4);
          for (let j = 0; j < messagesPerMember; j++) {
            const messageTexts = [
              "Hey everyone! Looking forward to our next game!",
              "Great match today, well played everyone!",
              "Anyone up for a practice session this weekend?",
              "Check out this new technique I learned!",
              "The weather looks perfect for outdoor activities.",
              "Did anyone catch the championship game last night?",
              "Looking for a doubles partner for next week.",
              "Thanks for the great game, learned a lot!",
              "Who's joining the tournament next month?",
              "New to the area, excited to play with you all!",
            ];

            await db.insert(messages).values({
              id: crypto.randomUUID(),
              roomId: room.id,
              senderId: selectedMembers[i].id,
              content:
                messageTexts[Math.floor(Math.random() * messageTexts.length)],
              messageType: "text",
              createdAt: new Date(Date.now() - Math.random() * 86400000 * 5), // Within last 5 days
              updatedAt: new Date(),
            });
            messageCount++;
          }
        }
      }
    }

    // Create activity-specific chat rooms for completed activities
    const completedActivities = this.createdActivities.filter(
      (a) => a.completionStatus === "completed"
    );

    for (const activity of completedActivities.slice(0, 3)) {
      // Limit to first 3 for demo
      const [activityRoom] = await db
        .insert(activityChatRooms)
        .values({
          id: crypto.randomUUID(),
          activityId: activity.id,
          name: `${activity.description} - Chat`,
          isActive: true,
          createdAt: new Date(activity.dateTime),
          updatedAt: new Date(),
        })
        .returning();

      chatRoomCount++;

      // Get activity participants
      const participants = await db
        .select()
        .from(activityParticipants)
        .where(eq(activityParticipants.activityId, activity.id));

      // Create activity chat messages
      for (const participant of participants) {
        const activityMessages = [
          "Great game everyone!",
          "Thanks for organizing this!",
          "When is our next match?",
          "Really enjoyed playing today.",
          "Good teamwork out there!",
          "See you at the next one!",
        ];

        if (Math.random() > 0.3) {
          // 70% chance each participant sends a message
          await db.insert(activityChatMessages).values({
            id: crypto.randomUUID(),
            chatRoomId: activityRoom.id,
            senderId: participant.userId,
            content:
              activityMessages[
                Math.floor(Math.random() * activityMessages.length)
              ],
            messageType: "text",
            createdAt: new Date(activity.completedAt || activity.dateTime),
            updatedAt: new Date(),
          });
          messageCount++;
        }
      }
    }

    this.stats.chatRooms = chatRoomCount;
    this.stats.messages = messageCount;
    console.log(
      `✅ Created ${chatRoomCount} chat rooms with ${messageCount} messages`
    );
  }

  private async createDeltaTracking() {
    console.log("📡 Creating delta tracking data...");

    let deltaCount = 0;
    const regularUsers = this.createdUsers.filter((u) => u.role === "user");

    // Create user delta cursors
    for (const user of regularUsers) {
      await db.insert(userDeltaCursors).values({
        userId: user.id,
        lastELOSync: new Date(Date.now() - Math.random() * 86400000),
        lastActivitySync: new Date(Date.now() - Math.random() * 86400000),
        lastSkillRatingSync: new Date(Date.now() - Math.random() * 86400000),
        lastConnectionSync: new Date(Date.now() - Math.random() * 86400000),
        lastMatchmakingSync: new Date(Date.now() - Math.random() * 86400000),
        clientType: Math.random() > 0.7 ? "mobile" : "web",
        lastActiveAt: new Date(Date.now() - Math.random() * 3600000),
      });
    }

    // Create sample entity changes
    const changeTypes = ["create", "update", "delete"] as const;
    const entityTypes = [
      "activity",
      "elo",
      "skill_rating",
      "connection",
      "message",
    ] as const;

    for (let i = 0; i < 50; i++) {
      const user =
        regularUsers[Math.floor(Math.random() * regularUsers.length)];
      const entityType =
        entityTypes[Math.floor(Math.random() * entityTypes.length)];
      const changeType =
        changeTypes[Math.floor(Math.random() * changeTypes.length)];

      await db.insert(entityChangeLog).values({
        id: crypto.randomUUID(),
        entityType,
        entityId: crypto.randomUUID().toString(),
        changeType,
        affectedUserId: user.id,
        relatedEntityId:
          Math.random() > 0.5 ? crypto.randomUUID().toString() : null,
        previousData: changeType === "update" ? { oldValue: "example" } : null,
        newData: {
          newValue: "example",
          timestamp: new Date().toISOString(),
        },
        changeDetails: {
          source: "test_data",
          reason: "data_population",
        },
        triggeredBy: user.id,
        changeSource: Math.random() > 0.5 ? "user_action" : "system",
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 7), // Within last week
      });
      deltaCount++;
    }

    // Create delta summaries
    for (const user of regularUsers.slice(0, 5)) {
      // First 5 users
      for (let day = 0; day < 7; day++) {
        const summaryDate = new Date(Date.now() - day * 86400000);

        await db.insert(deltaSummaries).values({
          id: crypto.randomUUID(),
          userId: user.id,
          summaryDate,
          eloChanges: Math.floor(Math.random() * 5),
          activityChanges: Math.floor(Math.random() * 10),
          skillRatingChanges: Math.floor(Math.random() * 15),
          connectionChanges: Math.floor(Math.random() * 3),
          summaryData: {
            totalChanges: Math.floor(Math.random() * 25),
            mostActiveHour: Math.floor(Math.random() * 24),
          },
          createdAt: summaryDate,
        });
      }
    }

    this.stats.deltaChanges = deltaCount;
    console.log(
      `✅ Created ${deltaCount} delta tracking entries and summaries`
    );
  }

  private printStats() {
    console.log("\n🎉 DATABASE POPULATION COMPLETE!");
    console.log("================================");
    console.log(`👥 Users: ${this.stats.users}`);
    console.log(`🏃 Activity Types: ${this.stats.activityTypes}`);
    console.log(`🎯 Skill Definitions: ${this.stats.skillDefinitions}`);
    console.log(`📅 Activities: ${this.stats.activities}`);
    console.log(`🏀 Teams: ${this.stats.teams}`);
    console.log(`🤝 User Connections: ${this.stats.connections}`);
    console.log(`💬 Chat Rooms: ${this.stats.chatRooms}`);
    console.log(`📨 Messages: ${this.stats.messages}`);
    console.log(`📊 ELO Records: ${this.stats.eloRecords}`);
    console.log(`⭐ Skill Ratings: ${this.stats.skillRatings}`);
    console.log(`📡 Delta Changes: ${this.stats.deltaChanges}`);

    console.log("\n✅ READY FOR TESTING:");
    console.log("====================");
    console.log('• User Authentication (password: "1_Pass@hH-app")');
    console.log("• Activity Creation & Management");
    console.log("• ELO Calculations & Rankings");
    console.log("• Skill Rating System");
    console.log("• Chat & Messaging");
    console.log("• Delta Polling & Real-time Updates");
    console.log("• Team Management");
    console.log("• Social Connections");

    console.log("\n🚀 SAMPLE TEST ACCOUNTS:");
    console.log("========================");
    this.createdUsers.slice(0, 5).forEach((user) => {
      console.log(`• ${user.username} (${user.email}) - Role: ${user.role}`);
    });

    console.log("\n🎯 NEXT STEPS:");
    console.log("==============");
    console.log("1. Start server: pnpm dev");
    console.log("2. Test login: POST /api/auth/login");
    console.log("3. View activities: GET /api/activities");
    console.log("4. Check ELO rankings: GET /api/users/me/elo-stats");
    console.log("5. Test delta polling: GET /api/delta/changes");
  }
}

// CLI execution
async function main() {
  console.log("🎯 COMPREHENSIVE DATABASE POPULATION\n");

  try {
    const populator = new DatabasePopulator();
    const stats = await populator.populateAll();

    console.log("\n✅ Population completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n💥 Population failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
