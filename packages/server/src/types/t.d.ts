import type { User } from '../middleware/auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
  }
}