'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { Card } from '@/components/ui/Card';
import { themeApi } from '@/lib/api/theme';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { useToast } from '@/components/ui/Toast';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Step 2 — Store appearance. Uses the existing Theme API (docs/API-SPEC.md §28):
 * primary color + font family. No visual page builder — basic configuration only.
 */
export function AppearanceStep({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [fontFamily, setFontFamily] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [colorError, setColorError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    themeApi
      .getTheme()
      .then((result) => {
        if (!mounted) return;
        const config = result.data.config as { primaryColor?: string; fontFamily?: string };
        if (config.primaryColor) setPrimaryColor(config.primaryColor);
        if (config.fontFamily) setFontFamily(config.fontFamily);
      })
      .catch(() => {
        // The theme is materialized lazily; absence is not an error here.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setColorError(undefined);

    if (!HEX_COLOR_PATTERN.test(primaryColor)) {
      setColorError(t('onboarding.colorInvalid'));
      return;
    }

    setSaving(true);
    try {
      await themeApi.updateTheme({
        primaryColor,
        ...(fontFamily.trim() ? { fontFamily: fontFamily.trim() } : {}),
      });
      toast.success(t('onboarding.appearanceSaved'));
      onDone();
    } catch (caught) {
      setFormError(apiErrorMessage(caught, t, 'onboarding.appearanceFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="onboarding__heading">
        <h1>{t('onboarding.step2Title')}</h1>
        <p>{t('onboarding.step2Desc')}</p>
      </div>

      {formError ? (
        <div className="alert alert--error" role="alert">
          {formError}
        </div>
      ) : null}

      <Card title={t('onboarding.storeAppearance')} description={t('onboarding.appearanceDesc')}>
        {loading ? (
          <p className="card__muted">{t('common.loading')}</p>
        ) : (
          <div className="form-grid form-grid--two">
            <Field
              label={t('onboarding.primaryColor')}
              htmlFor="onboarding-primary-color"
              hint={t('onboarding.primaryColorHint')}
              error={colorError}
            >
              <div className="onboarding__color-row">
                <Input
                  id="onboarding-primary-color"
                  dir="ltr"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                />
                <input
                  type="color"
                  aria-label={t('onboarding.primaryColorPicker')}
                  value={HEX_COLOR_PATTERN.test(primaryColor) ? primaryColor : '#2563eb'}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                />
              </div>
            </Field>

            <Field
              label={t('onboarding.fontFamily')}
              htmlFor="onboarding-font-family"
              hint={t('onboarding.fontFamilyHint')}
            >
              <Input
                id="onboarding-font-family"
                value={fontFamily}
                onChange={(event) => setFontFamily(event.target.value)}
                placeholder="Inter"
              />
            </Field>
          </div>
        )}
      </Card>

      <div className="onboarding__actions">
        <Button type="submit" size="lg" loading={saving} disabled={loading}>
          {saving ? t('common.saving') : t('onboarding.saveAppearance')}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onSkip}>
          {t('onboarding.skip')}
        </Button>
      </div>
    </form>
  );
}
