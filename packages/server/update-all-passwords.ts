import 'dotenv/config';
import { hashPassword } from './src/utils/security.js';
import { users } from './src/db/schema';
import { db } from './src/db/client';

const newPassword = '1_Pass@hH-app';
const hashedPassword = await hashPassword(newPassword);

await db.update(users).set({ 
  passwordHash: hashedPassword,
  updatedAt: new Date()
});

console.log('✅ All passwords updated to: password123');
