'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '@/lib/api/client';
import { mediaContentUrl } from '@/lib/api/media';

/**
 * Renders a media asset in the MERCHANT dashboard by fetching the binary
 * through the authenticated media content endpoint (Authorization header) and
 * creating an object URL. The backend resolves the media row store-scoped, so
 * only media belonging to the merchant's own store can ever be rendered — a
 * cross-tenant id fails closed with NOT_FOUND.
 *
 * A placeholder is shown while loading / when the asset cannot be fetched.
 */
export function DashboardMediaImage({
  mediaId,
  alt,
  className,
}: {
  mediaId: string | null;
  alt?: string | null;
  className?: string;
}) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    let objectUrl: string | null = null;

    if (!mediaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl('');
      return;
    }

    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch(mediaContentUrl(mediaId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (mounted) setUrl(objectUrl);
      } catch {
        // Keep the placeholder; never surface a broken URL.
      }
    })();

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  if (!mediaId || !url) {
    return (
      <div
        className={className ? `media-thumb media-thumb--placeholder ${className}` : 'media-thumb media-thumb--placeholder'}
        aria-hidden="true"
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- dashboard media is user content via blob proxy
  return <img className={className ? `media-thumb ${className}` : 'media-thumb'} src={url} alt={alt ?? ''} loading="lazy" />;
}
