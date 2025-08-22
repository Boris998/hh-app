import { Hono } from "hono";
import { deltaRouter } from "../../routes/delta.router";
import enhancedActivitiesRouter from "../../routes/enhanced-activities.router";
import { skillRatingRouter } from "../../routes/skill-rating.router";

export const testApp = new Hono();

// Mount routers with API prefix to match actual app
testApp.route('/api/delta', deltaRouter);
testApp.route('/api/activities', enhancedActivitiesRouter);
testApp.route('/api/skills', skillRatingRouter);