-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "classesCounted" INTEGER;

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
