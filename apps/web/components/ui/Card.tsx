import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Card container with optional header (title + description + actions). */
export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: CardProps) {
  return (
    <section className={cn('card', className)}>
      {title || actions ? (
        <header className="card__header">
          <div>
            {title ? <h2 className="card__title">{title}</h2> : null}
            {description ? <p className="card__description">{description}</p> : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('card__body', bodyClassName)}>{children}</div>
    </section>
  );
}
