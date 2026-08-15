'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { SectionHeading } from './SectionHeading';
import { BrowserChrome } from './mockups';

const CMS_ITEMS = [
  'pages',
  'sections',
  'navigation',
  'logo',
  'colors',
  'typography',
  'layout',
] as const;
const ICONS: Record<(typeof CMS_ITEMS)[number], string> = {
  pages: '▤',
  sections: '☰',
  navigation: '➤',
  logo: '◉',
  colors: '◐',
  typography: 'Aa',
  layout: '▦',
};

/**
 * CMS / customization showcase — merchants configure pages, sections,
 * navigation and theme. It explicitly does NOT claim a drag-and-drop builder.
 */
export function CmsShowcase() {
  const { t } = useI18n();

  return (
    <section className="mk-section" aria-labelledby="cms-title">
      <div className="mk-container">
        <div className="mk-cms__layout">
          <div className="mk-cms__text">
            <SectionHeading
              align="left"
              eyebrow={t('marketing.cms.eyebrow')}
              title={t('marketing.cms.title')}
              description={t('marketing.cms.desc')}
            />
            <ul className="mk-cms__list">
              {CMS_ITEMS.map((item) => (
                <li className="mk-cms__item" key={item}>
                  <span className="mk-cms__item-icon" aria-hidden="true">
                    {ICONS[item]}
                  </span>
                  <div>
                    <strong>{t(`marketing.cms.${item}`)}</strong>
                    <p>{t(`marketing.cms.${item}Desc`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mk-cms__note">{t('marketing.cms.note')}</p>
          </div>

          <div className="mk-cms__visual" aria-hidden="true">
            <BrowserChrome url="app.ziad-ecommerce.com/dashboard/store">
              <div className="mk-theme-panel">
                <div className="mk-theme-panel__head">
                  <strong>Theme</strong>
                  <span>Configured</span>
                </div>
                <div className="mk-theme-panel__row">
                  <label>Logo</label>
                  <span className="mk-theme-panel__logo">Z</span>
                </div>
                <div className="mk-theme-panel__row">
                  <label>Colors</label>
                  <span className="mk-theme-panel__swatches">
                    <i style={{ background: '#008060' }} />
                    <i style={{ background: '#202223' }} />
                    <i style={{ background: '#6d7175' }} />
                  </span>
                </div>
                <div className="mk-theme-panel__row">
                  <label>Typography</label>
                  <span className="mk-theme-panel__select">System font ▾</span>
                </div>
                <div className="mk-theme-panel__row">
                  <label>Navigation</label>
                  <span className="mk-theme-panel__nav">Home · Products · About</span>
                </div>
                <div className="mk-theme-panel__row">
                  <label>Pages</label>
                  <span className="mk-theme-panel__pages">
                    <i>Home · Published</i>
                    <i>About · Draft</i>
                  </span>
                </div>
              </div>
            </BrowserChrome>
          </div>
        </div>
      </div>
    </section>
  );
}
