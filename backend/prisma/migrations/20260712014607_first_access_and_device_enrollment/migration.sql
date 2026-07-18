-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "allowEnrollment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
