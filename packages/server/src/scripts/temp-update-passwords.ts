import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { users } from '../db/schema';
import { db } from '../db/client';

const hash = await bcrypt.hash('1_Pass@hH-app', 10);
await db.update(users).set({ passwordHash: hash, updatedAt: new Date() });

const allUsers = await db.select({ email: users.email }).from(users);
console.log('✅ Updated passwords for:', allUsers.map(u => u.email));
console.log('🔑 New password: 1_Pass@hH-app');