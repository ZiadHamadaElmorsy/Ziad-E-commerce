'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { initialsFrom, titleCase } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

/**
 * User / profile menu in the dashboard header. Shows the authenticated
 * merchant's identity (never any token), the store, and the membership role.
 */
export function UserMenu() {
  const { user, store, membership, signOut } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = user?.email ?? t('userMenu.merchant');

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="user-menu">
      <button
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="user-menu__avatar">{initialsFrom(undefined, user?.email)}</span>
        <span className="user-menu__details">
          <span className="user-menu__name">{displayName}</span>
          <span className="user-menu__store">{store?.name ?? t('userMenu.noStore')}</span>
        </span>
        <span className="user-menu__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="user-menu__dropdown" role="menu">
          <div className="user-menu__identity">
            <div className="user-menu__identity-row">
              <span className="user-menu__avatar user-menu__avatar--lg">
                {initialsFrom(undefined, user?.email)}
              </span>
              <div>
                <p className="user-menu__identity-name">{displayName}</p>
                <p className="user-menu__identity-email">{user?.email}</p>
              </div>
            </div>
            <dl className="user-menu__meta">
              <div>
                <dt>{t('userMenu.store')}</dt>
                <dd>{store?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('userMenu.storeSlug')}</dt>
                <dd>{store?.slug ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('userMenu.role')}</dt>
                <dd>
                  {membership ? <Badge tone="blue">{titleCase(membership.role)}</Badge> : '—'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="user-menu__actions">
            <button
              type="button"
              className="user-menu__signout"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? t('userMenu.signingOut') : t('userMenu.logOut')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
