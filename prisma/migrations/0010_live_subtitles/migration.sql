-- CreateTable
CREATE TABLE "ZjuLiveSubtitle" (
    "id" TEXT NOT NULL,
    "lessonKey" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audioSource" TEXT NOT NULL DEFAULT 'classroom',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL DEFAULT 'volcengine',
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "generation" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "partial" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "audioMs" INTEGER NOT NULL DEFAULT 0,
    "billedAudioMs" INTEGER NOT NULL DEFAULT 0,
    "lastSequence" INTEGER,
    "timelineMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZjuLiveSubtitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZjuLiveSubtitleCue" (
    "id" TEXT NOT NULL,
    "subtitleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,

    CONSTRAINT "ZjuLiveSubtitleCue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZjuLiveSubtitleSegment" (
    "id" TEXT NOT NULL,
    "subtitleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZjuLiveSubtitleSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZjuLiveSubtitleViewer" (
    "subtitleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZjuLiveSubtitleViewer_pkey" PRIMARY KEY ("subtitleId","userId","clientId")
);

-- CreateTable
CREATE TABLE "ZjuLiveSubtitleDailyUsage" (
    "day" TEXT NOT NULL,
    "audioMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ZjuLiveSubtitleDailyUsage_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZjuLiveSubtitle_lessonKey_key" ON "ZjuLiveSubtitle"("lessonKey");

-- CreateIndex
CREATE INDEX "ZjuLiveSubtitle_status_leaseUntil_idx" ON "ZjuLiveSubtitle"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "ZjuLiveSubtitle_expiresAt_idx" ON "ZjuLiveSubtitle"("expiresAt");

-- CreateIndex
CREATE INDEX "ZjuLiveSubtitleCue_subtitleId_revision_idx" ON "ZjuLiveSubtitleCue"("subtitleId", "revision");

-- CreateIndex
CREATE INDEX "ZjuLiveSubtitleCue_subtitleId_startMs_idx" ON "ZjuLiveSubtitleCue"("subtitleId", "startMs");

-- CreateIndex
CREATE UNIQUE INDEX "ZjuLiveSubtitleCue_subtitleId_key_key" ON "ZjuLiveSubtitleCue"("subtitleId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ZjuLiveSubtitleSegment_subtitleId_sequence_key" ON "ZjuLiveSubtitleSegment"("subtitleId", "sequence");

-- CreateIndex
CREATE INDEX "ZjuLiveSubtitleViewer_subtitleId_lastSeenAt_idx" ON "ZjuLiveSubtitleViewer"("subtitleId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "ZjuLiveSubtitleCue" ADD CONSTRAINT "ZjuLiveSubtitleCue_subtitleId_fkey" FOREIGN KEY ("subtitleId") REFERENCES "ZjuLiveSubtitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZjuLiveSubtitleSegment" ADD CONSTRAINT "ZjuLiveSubtitleSegment_subtitleId_fkey" FOREIGN KEY ("subtitleId") REFERENCES "ZjuLiveSubtitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZjuLiveSubtitleViewer" ADD CONSTRAINT "ZjuLiveSubtitleViewer_subtitleId_fkey" FOREIGN KEY ("subtitleId") REFERENCES "ZjuLiveSubtitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZjuLiveSubtitleViewer" ADD CONSTRAINT "ZjuLiveSubtitleViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
