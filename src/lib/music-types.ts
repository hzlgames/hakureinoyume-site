export type NeteaseProfile = { userId: string; nickname: string; avatarUrl: string | null };
export type AccountState = {
  siteAuthenticated: boolean;
  siteUserId?: string;
  neteaseAuthenticated: boolean;
  profile: NeteaseProfile | null;
  expired?: boolean;
  degraded?: boolean;
};
export type MusicSong = {
  rowId?: string;
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl: string | null;
  duration: number | null;
  addedAt?: string;
};
export type MusicPlaylist = { id: string; name: string; coverUrl: string | null; trackCount: number; playCount: number };
export type MusicAlbum = { id: string; name: string; artists: string; coverUrl: string | null; trackCount: number; publishTime: number | null; company: string | null };
export type WebPlaylistState = { playlist: { id: string; name: string; trackCount: number }; songs: MusicSong[] };
export type SongSource = { url: string | null; trial?: boolean; expiresIn?: number | null; song?: MusicSong | null };
