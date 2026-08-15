'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { SectionHeading } from './SectionHeading';

/**
 * FAQ — native <details>/<summary> accordion: keyboard accessible and
 * requires no JavaScript state.
 */
export function FaqSection() {
  const { t } = useI18n();
  const FAQ_ITEMS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

  return (
    <section className="mk-section mk-section--tint" id="faq" aria-labelledby="faq-title">
      <div className="mk-container">
        <SectionHeading
          eyebrow={t('marketing.faq.eyebrow')}
          title={t('marketing.faq.title')}
          description={t('marketing.faq.desc')}
        />

        <div className="mk-faq">
          {FAQ_ITEMS.map((item) => (
            <details className="mk-faq__item" key={item}>
              <summary className="mk-faq__summary">
                <span>{t(`marketing.faq.q${item}`)}</span>
                <span className="mk-faq__toggle" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mk-faq__answer">{t(`marketing.faq.a${item}`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
