import { prisma } from '../db/prismaClient';

const FAMILY_INVITE_CODE = 'FAMILY2026';

/**
 * Lazy upsert — no pre-seeding needed, an AI user row is created on first
 * use. Numbered from 1, per docs/fazis-0c-dama-ai-specifikacio.md §4.
 */
export async function ensureAiUser(aiNumber: number): Promise<string> {
  const id = `ai-opponent-${aiNumber}`;
  await prisma.user.upsert({
    where: { id },
    update: {},
    create: { id, displayName: `AI ellenfél ${aiNumber}`, inviteCode: FAMILY_INVITE_CODE },
  });
  return id;
}
