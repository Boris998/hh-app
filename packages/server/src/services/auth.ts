import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export async function registerUser(data: z.infer<typeof registerSchema>) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, data.email),
  });

  if (existingUser) throw new Error("User already exists");

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const [newUser] = await db
    .insert(users)
    .values({
      email: data.email,
      password: hashedPassword,
      name: data.name ?? '',
    })
    .returning();

  return newUser;
}
