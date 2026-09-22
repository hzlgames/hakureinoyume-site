CREATE TABLE "TwoFactorAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TwoFactorAccount_userId_fingerprint_key" ON "TwoFactorAccount"("userId", "fingerprint");
CREATE INDEX "TwoFactorAccount_userId_createdAt_idx" ON "TwoFactorAccount"("userId", "createdAt");
ALTER TABLE "TwoFactorAccount" ADD CONSTRAINT "TwoFactorAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
