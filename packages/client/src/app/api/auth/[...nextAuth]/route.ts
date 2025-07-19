import { NextResponse } from 'next/server';
import z from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.flatten() },
        { status: 400 }
      );
    }

    const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
    const res = await fetch(`${serverUrl}/auth/register`, {
      method: 'POST',
      headers: req.headers,
      body: await req.text(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (_error) {
    return NextResponse.json(
      { error: (_error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}