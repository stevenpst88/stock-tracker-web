import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, userSettings } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import type { UserSettings } from '@/shared/types';

const DEFAULT_SETTINGS: UserSettings = {
  claudeModel: 'claude-sonnet-4-6',
  geminiModel: 'gemini-2.5-flash',
  reserveCash: 0,
  radarScorePreset: 'balanced',
};

export const GET = withAuth(async (_req, { userId }) => {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const stored = (row?.jsonData ?? {}) as UserSettings;
  return NextResponse.json({ ...DEFAULT_SETTINGS, ...stored });
});

export const PATCH = withAuth(async (req, { userId }) => {
  const patch = (await req.json()) as Partial<UserSettings>;
  const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const merged = { ...(existing?.jsonData ?? {}), ...patch } as UserSettings;

  await db
    .insert(userSettings)
    .values({ userId, jsonData: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { jsonData: merged, updatedAt: new Date() },
    });

  return NextResponse.json({ ...DEFAULT_SETTINGS, ...merged });
});
