'use client';

import { cn } from '@/lib/utils';

/**
 * Consistent marketing section heading: eyebrow + title + optional
 * description. Used by every section so the visual hierarchy stays uniform.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  className?: string;
}) {
  return (
    <div className={cn('mk-section-head', align === 'left' && 'mk-section-head--left', className)}>
      <p className="mk-eyebrow">{eyebrow}</p>
      <h2 className="mk-title">{title}</h2>
      {description ? <p className="mk-desc">{description}</p> : null}
    </div>
  );
}
