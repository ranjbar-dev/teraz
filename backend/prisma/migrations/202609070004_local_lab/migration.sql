ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE TABLE "EmailVerification" (
  "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3)
);
CREATE INDEX "EmailVerification_userId_idx" ON "EmailVerification"("userId");
CREATE TABLE "LocalMail" (
  "id" UUID NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LocalMail_email_createdAt_idx" ON "LocalMail"("email", "createdAt");
