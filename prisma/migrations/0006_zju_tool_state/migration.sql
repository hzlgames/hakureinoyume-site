CREATE TABLE "ZjuToolState" (
 "userId" TEXT NOT NULL, "key" TEXT NOT NULL, "value" JSONB NOT NULL,
 "lockedUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ZjuToolState_pkey" PRIMARY KEY ("userId", "key"),
 CONSTRAINT "ZjuToolState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ZjuToolState_key_idx" ON "ZjuToolState"("key");
