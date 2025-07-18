import type { Session } from '../auth/session.js';
import type { Database } from '../db/index.js';

type Variables = {
  session: Session | null;
  db: Database;
};

export interface AppContext {
  Variables: Variables;
}
