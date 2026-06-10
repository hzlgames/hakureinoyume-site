ALTER TABLE "WebMusicPlaylistSong" ADD COLUMN "position" INTEGER;

WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "playlistId" ORDER BY "addedAt" ASC, "id" ASC) - 1 AS next_position
  FROM "WebMusicPlaylistSong"
)
UPDATE "WebMusicPlaylistSong"
SET "position" = ordered.next_position
FROM ordered
WHERE "WebMusicPlaylistSong"."id" = ordered."id";

ALTER TABLE "WebMusicPlaylistSong" ALTER COLUMN "position" SET NOT NULL;
ALTER TABLE "WebMusicPlaylistSong" ALTER COLUMN "position" SET DEFAULT 0;

CREATE INDEX "WebMusicPlaylistSong_playlistId_position_idx" ON "WebMusicPlaylistSong"("playlistId", "position");
