'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { SectionHeading } from './SectionHeading';

const ICONS = ['✎', '◉', '◈', '⚙', '▶'];

/**
 * How It Works — a simple five-step flow from account creation to launch.
 */
export function HowItWorks() {
  const { t } = useI18n();
  const STEPS = [1, 2, 3, 4, 5] as const;

  return (
    <section className="mk-section" id="how-it-works" aria-labelledby="how-title">
      <div className="mk-container">
        <SectionHeading
          eyebrow={t('marketing.how.eyebrow')}
          title={t('marketing.how.title')}
          description={t('marketing.how.desc')}
        />

        <ol className="mk-how__steps">
          {STEPS.map((step) => (
            <li className="mk-how__step" key={step}>
              <div className="mk-how__step-top">
                <span className="mk-how__step-num">{step}</span>
                <span className="mk-how__step-icon" aria-hidden="true">
                  {ICONS[step - 1]}
                </span>
              </div>
              <h3 className="mk-how__step-title">{t(`marketing.how.step${step}`)}</h3>
              <p className="mk-how__step-desc">{t(`marketing.how.step${step}Desc`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
