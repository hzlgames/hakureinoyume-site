-- CreateTable
CREATE TABLE "ZjuLiveSubtitleGrant" (
    "subtitleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZjuLiveSubtitleGrant_pkey" PRIMARY KEY ("subtitleId","userId")
);

-- AddForeignKey
ALTER TABLE "ZjuLiveSubtitleGrant" ADD CONSTRAINT "ZjuLiveSubtitleGrant_subtitleId_fkey" FOREIGN KEY ("subtitleId") REFERENCES "ZjuLiveSubtitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZjuLiveSubtitleGrant" ADD CONSTRAINT "ZjuLiveSubtitleGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve already-authorized viewers through the post-live/transcoding transition.
INSERT INTO "ZjuLiveSubtitleGrant" ("subtitleId", "userId")
SELECT DISTINCT "subtitleId", "userId" FROM "ZjuLiveSubtitleViewer"
ON CONFLICT DO NOTHING;
