CREATE TABLE "WebMusicPlaylist" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '网页歌单',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebMusicPlaylist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebMusicPlaylistSong" (
  "id" TEXT NOT NULL,
  "playlistId" TEXT NOT NULL,
  "songId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "artists" TEXT NOT NULL,
  "album" TEXT,
  "coverUrl" TEXT,
  "duration" INTEGER,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebMusicPlaylistSong_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebMusicPlaylist_userId_name_key" ON "WebMusicPlaylist"("userId", "name");
CREATE INDEX "WebMusicPlaylist_userId_idx" ON "WebMusicPlaylist"("userId");
CREATE UNIQUE INDEX "WebMusicPlaylistSong_playlistId_songId_key" ON "WebMusicPlaylistSong"("playlistId", "songId");
CREATE INDEX "WebMusicPlaylistSong_playlistId_idx" ON "WebMusicPlaylistSong"("playlistId");
CREATE INDEX "WebMusicPlaylistSong_songId_idx" ON "WebMusicPlaylistSong"("songId");

ALTER TABLE "WebMusicPlaylist" ADD CONSTRAINT "WebMusicPlaylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebMusicPlaylistSong" ADD CONSTRAINT "WebMusicPlaylistSong_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "WebMusicPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
