CREATE TABLE "NeteaseAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "neteaseUserId" TEXT,
  "nickname" TEXT,
  "avatarUrl" TEXT,
  "cookieCiphertext" TEXT NOT NULL,
  "cookieIv" TEXT NOT NULL,
  "cookieTag" TEXT NOT NULL,
  "profile" JSONB,
  "loginStatus" TEXT NOT NULL DEFAULT 'active',
  "lastValidatedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NeteaseAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NeteaseAccount_userId_key" ON "NeteaseAccount"("userId");
CREATE INDEX "NeteaseAccount_neteaseUserId_idx" ON "NeteaseAccount"("neteaseUserId");
CREATE INDEX "NeteaseAccount_loginStatus_idx" ON "NeteaseAccount"("loginStatus");

ALTER TABLE "NeteaseAccount" ADD CONSTRAINT "NeteaseAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
