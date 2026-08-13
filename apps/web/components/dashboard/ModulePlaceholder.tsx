'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';

/** Shared placeholder for modules that are not part of the MVP admin yet. */
export function ModulePlaceholder({
  title,
  description,
  icon,
  plannedFeatures,
}: {
  title: string;
  description: string;
  icon: string;
  plannedFeatures: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="page">
      <PageHeader title={title} description={description} />
      <Card>
        <div className="placeholder">
          <div className="placeholder__icon" aria-hidden="true">
            {icon}
          </div>
          <h2 className="placeholder__title">{t('placeholder.comingSoon')}</h2>
          <p className="placeholder__description">{t('placeholder.desc')}</p>
          <ul className="placeholder__list">
            {plannedFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

export function PlaceholderPage({
  title,
  description,
  icon,
  plannedFeatures,
}: {
  title: string;
  description: string;
  icon: string;
  plannedFeatures: string[];
}) {
  return (
    <ModulePlaceholder
      title={title}
      description={description}
      icon={icon}
      plannedFeatures={plannedFeatures}
    />
  );
}
