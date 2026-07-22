import { prisma } from '../db/prismaClient';

export class InvalidInviteCodeError extends Error {}

export async function redeemInviteCode(code: string, displayName: string) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.inviteCode.findUnique({ where: { code } });
    if (!invite) throw new InvalidInviteCodeError('Ismeretlen meghívó-kód.');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new InvalidInviteCodeError('A meghívó-kód lejárt.');
    }
    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new InvalidInviteCodeError('A meghívó-kód elfogyott.');
    }

    await tx.inviteCode.update({ where: { code }, data: { usesCount: { increment: 1 } } });
    return tx.user.create({ data: { displayName, inviteCode: code } });
  });
}
