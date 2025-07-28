// src/lib/context.ts - Fixed context types
import type { User } from '../middleware/auth.js';
import type { Database } from '../db/client.js';

type Variables = {
  user: User;
  validatedBody: any; // Add validatedBody to context
  db?: Database;
};

export interface AppContext {
  Variables: Variables;
}