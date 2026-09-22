'use client';
import Image from 'next/image';
import { Music } from 'lucide-react';
import { useState } from 'react';
import { safeMusicUrl } from '../../../lib/netease-protocol';

export function Artwork({ src, alt, size }: { src: string | null | undefined; alt: string; size: number }) {
  const url = safeMusicUrl(src);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return url && failedUrl !== url ? (
    <Image key={url} src={url} alt={alt} width={size} height={size} onError={() => setFailedUrl(url)} />
  ) : <span className="netease-artwork-fallback" role="img" aria-label={`${alt}（暂无封面）`}><Music size={Math.max(16, size / 3)} /></span>;
}
