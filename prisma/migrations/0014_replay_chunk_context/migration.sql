ALTER TABLE "ZjuReplayTranscriptChunk" ADD COLUMN "audioStartMs" INTEGER NOT NULL DEFAULT 0;
UPDATE "ZjuReplayTranscriptChunk" SET "audioStartMs" = "startMs";
CREATE INDEX "ZjuToolJob_replayTranscriptId_status_idx" ON "ZjuToolJob"("replayTranscriptId", "status");
