'use client';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { CategoryStatus, MembershipRole, ProductStatus, VariantStatus } from '@/lib/api/types';

type BadgeTone = 'green' | 'amber' | 'gray' | 'red' | 'blue';

const STATUS_TONES: Record<string, BadgeTone> = {
  ACTIVE: 'green',
  PUBLISHED: 'green',
  OWNER: 'blue',
  ADMIN: 'blue',
  STAFF: 'gray',
  DRAFT: 'gray',
  PENDING: 'amber',
  PROCESSING: 'amber',
  ARCHIVED: 'gray',
  INACTIVE: 'gray',
  DISABLED: 'gray',
  SUSPENDED: 'red',
  EXPIRED: 'red',
  FAILED: 'red',
  SUCCEEDED: 'green',
  CANCELLED: 'red',
};

export function Badge({
  children,
  tone = 'gray',
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return <span className={cn('badge', `badge--${tone}`, className)}>{children}</span>;
}

/** Renders a lifecycle status value (DRAFT/ACTIVE/ARCHIVED/...) as a localized badge. */
export function StatusBadge({
  status,
  className,
}: {
  status: ProductStatus | VariantStatus | CategoryStatus | MembershipRole | string;
  className?: string;
}) {
  const { tStatus } = useI18n();
  return (
    <Badge tone={STATUS_TONES[status] ?? 'gray'} className={className}>
      {tStatus(status)}
    </Badge>
  );
}
