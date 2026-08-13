import type { ReactNode } from 'react';

/** Placeholder block used when a list/table has no data yet. */
export function EmptyState({
  icon = '📦',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="empty-state__title">{title}</h3>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
