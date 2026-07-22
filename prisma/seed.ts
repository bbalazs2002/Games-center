import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.inviteCode.upsert({
    where: { code: 'FAMILY2026' },
    update: {},
    create: { code: 'FAMILY2026', label: 'Család és barátok' },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
