/*
  Warnings:

  - Added the required column `contactName` to the `demo_requests` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "demo_requests" ADD COLUMN     "contactName" VARCHAR(150) NOT NULL;
