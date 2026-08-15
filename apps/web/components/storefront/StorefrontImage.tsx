'use client';

import { useEffect, useState } from 'react';
import { useStorefront } from '@/lib/storefront/storefront-context';

/**
 * Resolves a store media id to a displayable image URL through the header-based
 * storefront media proxy (the backend resolves the media row store-scoped). A
 * fallback placeholder is shown while loading / when the asset cannot load.
 */
export function StorefrontImage({
  mediaId,
  alt,
  className,
}: {
  mediaId: string | null;
  alt?: string | null;
  className?: string;
}) {
  const { mediaUrl } = useStorefront();
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    if (!mediaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl('');
      return;
    }
    void mediaUrl(mediaId).then((resolved) => {
      if (mounted) setUrl(resolved);
    });
    return () => {
      mounted = false;
    };
  }, [mediaId, mediaUrl]);

  if (!mediaId || !url) {
    return <div className={className ? `sf-image sf-image--placeholder ${className}` : 'sf-image sf-image--placeholder'} aria-hidden="true" />;
  }

  // eslint-disable-next-line @next/next/no-img-element -- storefront images are user media via blob proxy
  return <img className={className ? `sf-image ${className}` : 'sf-image'} src={url} alt={alt ?? ''} loading="lazy" />;
}
