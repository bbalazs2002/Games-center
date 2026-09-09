-- AlterTable
ALTER TABLE "game_sessions" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "userId" TEXT;
