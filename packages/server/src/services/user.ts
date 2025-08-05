import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

export async function createUser(email: string, password: string) {
  const [user] = await db.insert(users)
    .values({ email, password })
    .returning();
  return user;
}

export async function getUserById(id: number) {
  return db.query.users.findFirst({
    where: eq(users.id, id)
  });
}