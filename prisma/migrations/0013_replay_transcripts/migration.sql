ALTER TABLE "user" ADD COLUMN "asrQuotaExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ZjuLiveSubtitleDailyUsage" ADD COLUMN "exemptAudioMs" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "ZjuReplayTranscript" (
 "id" TEXT NOT NULL PRIMARY KEY, "lessonKey" TEXT NOT NULL, "courseId" TEXT NOT NULL, "subId" TEXT NOT NULL,
 "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "leaseOwner" TEXT, "leaseUntil" TIMESTAMP(3),
 "generation" INTEGER NOT NULL DEFAULT 0, "durationMs" INTEGER NOT NULL DEFAULT 0, "processedMs" INTEGER NOT NULL DEFAULT 0,
 "error" TEXT, "srt" TEXT NOT NULL DEFAULT '', "txt" TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ZjuReplayTranscript_lessonKey_key" ON "ZjuReplayTranscript"("lessonKey");
CREATE INDEX "ZjuReplayTranscript_status_leaseUntil_idx" ON "ZjuReplayTranscript"("status", "leaseUntil");
CREATE TABLE "ZjuReplayTranscriptChunk" (
 "id" TEXT NOT NULL PRIMARY KEY, "transcriptId" TEXT NOT NULL, "startMs" INTEGER NOT NULL, "durationMs" INTEGER NOT NULL,
 "requestId" TEXT NOT NULL, "resourceId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'submitting', "cues" JSONB,
 "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ZjuReplayTranscriptChunk_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "ZjuReplayTranscript"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ZjuReplayTranscriptChunk_requestId_key" ON "ZjuReplayTranscriptChunk"("requestId");
CREATE UNIQUE INDEX "ZjuReplayTranscriptChunk_transcriptId_startMs_key" ON "ZjuReplayTranscriptChunk"("transcriptId", "startMs");
ALTER TABLE "ZjuToolJob" ADD COLUMN "replayTranscriptId" TEXT;
ALTER TABLE "ZjuToolJob" ADD CONSTRAINT "ZjuToolJob_replayTranscriptId_fkey" FOREIGN KEY ("replayTranscriptId") REFERENCES "ZjuReplayTranscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Exemption is granted explicitly by stable user id during rollout, never by display name.
