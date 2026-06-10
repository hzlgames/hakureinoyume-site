CREATE TABLE "ZjuAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordCiphertext" TEXT NOT NULL,
  "passwordIv" TEXT NOT NULL,
  "passwordTag" TEXT NOT NULL,
  "pintiaCiphertext" TEXT,
  "pintiaIv" TEXT,
  "pintiaTag" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZjuAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZjuToolJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tool" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "input" JSONB,
  "output" JSONB,
  "logs" TEXT NOT NULL DEFAULT '',
  "error" TEXT,
  "workDir" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "exitCode" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZjuToolJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZjuAccount_userId_key" ON "ZjuAccount"("userId");
CREATE INDEX "ZjuAccount_username_idx" ON "ZjuAccount"("username");
CREATE INDEX "ZjuToolJob_userId_idx" ON "ZjuToolJob"("userId");
CREATE INDEX "ZjuToolJob_tool_idx" ON "ZjuToolJob"("tool");
CREATE INDEX "ZjuToolJob_status_idx" ON "ZjuToolJob"("status");
CREATE INDEX "ZjuToolJob_createdAt_idx" ON "ZjuToolJob"("createdAt");

ALTER TABLE "ZjuAccount" ADD CONSTRAINT "ZjuAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZjuToolJob" ADD CONSTRAINT "ZjuToolJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
