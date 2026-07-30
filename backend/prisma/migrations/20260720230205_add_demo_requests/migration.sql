-- CreateTable
CREATE TABLE "demo_requests" (
    "id" TEXT NOT NULL,
    "institutionName" VARCHAR(200) NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "plan" VARCHAR(50) NOT NULL DEFAULT 'Escola',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_requests_email_key" ON "demo_requests"("email");

-- CreateIndex
CREATE UNIQUE INDEX "demo_requests_phone_key" ON "demo_requests"("phone");
