import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { MarketingNavbar } from '@/components/marketing/MarketingNavbar';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

const { getSessionMock, onAuthStateChangeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The marketing navbar observes the Supabase session to swap its primary CTA
// for signed-in merchants (Phase 18).
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }),
}));

import Home from './page';

function renderHome() {
  // Mirrors the marketing layout: navbar + page + footer.
  return render(
    <I18nProvider>
      <div className="mk-site">
        <MarketingNavbar />
        <main>
          <Home />
        </main>
        <MarketingFooter />
      </div>
    </I18nProvider>,
  );
}

describe('Marketing homepage', () => {
  beforeEach(() => {
    // Default: a public (signed-out) visitor.
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: null } });
    onAuthStateChangeMock.mockReset();
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('renders the hero with the core value proposition', async () => {
    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Create, manage, and grow your online store — from one platform.',
      }),
    ).toBeInTheDocument();
  });

  it('routes the primary CTA to signup and the secondary CTA to the demo', async () => {
    renderHome();

    // Wait for the session to resolve so the public actions are rendered.
    const startSelling = await screen.findAllByRole('link', { name: 'Start Selling' });
    expect(startSelling.length).toBeGreaterThan(0);
    for (const link of startSelling) {
      expect(link).toHaveAttribute('href', '/signup');
    }

    const seeDemo = screen.getByRole('link', { name: 'See Demo' });
    expect(seeDemo).toHaveAttribute('href', '/demo');
  });

  it('exposes login, get-started, and demo links in the navigation for public users', async () => {
    renderHome();

    // Login and Get Started appear in the navbar and the footer.
    const loginLinks = await screen.findAllByRole('link', { name: 'Login' });
    expect(loginLinks.length).toBeGreaterThan(0);
    for (const link of loginLinks) {
      expect(link).toHaveAttribute('href', '/login');
    }

    const getStartedLinks = await screen.findAllByRole('link', { name: 'Get Started' });
    expect(getStartedLinks.length).toBeGreaterThan(0);
    for (const link of getStartedLinks) {
      expect(link).toHaveAttribute('href', '/signup');
    }

    // The navbar exposes the demo as a first-class destination.
    expect(screen.getByRole('link', { name: 'Demo' })).toHaveAttribute('href', '/demo');
  });

  it('shows "Go to Dashboard" instead of the signup CTA for a signed-in merchant', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token', user: { id: 'u-1' } } },
    });
    renderHome();

    // The navbar (banner) swaps its primary CTA for a signed-in merchant.
    const navbar = within(await screen.findByRole('banner'));
    const goToDashboard = await navbar.findByRole('link', { name: 'Go to Dashboard' });
    expect(goToDashboard).toHaveAttribute('href', '/dashboard');

    // The signup funnel is hidden from the navigation for a signed-in merchant.
    expect(navbar.queryByRole('link', { name: 'Get Started' })).not.toBeInTheDocument();
    expect(navbar.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
  });

  it('renders all key marketing sections', async () => {
    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Everything your store needs, in one platform',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Everything you need to run your store' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'From signup to selling in five steps' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Every merchant publishes their own online store' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Make your storefront yours' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accept online payments' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Simple pricing for every stage' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Frequently asked questions' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Ready to launch your online store?' }),
    ).toBeInTheDocument();
  });

  it('marks pricing as placeholder — no invented prices', async () => {
    renderHome();

    // The placeholder pricing line must be present on all three cards, and no
    // invented currency is introduced by the pricing section.
    expect((await screen.findAllByText('Pricing not yet published')).length).toBe(3);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('renders all eight FAQ questions', async () => {
    renderHome();

    const questions = [
      'What is Ziad E-commerce?',
      'Do I get my own online store?',
      'Do I need technical knowledge?',
      'Can I manage products and inventory?',
      'Can I manage orders and customers?',
      'Can I accept online payments?',
      'Can I customize my storefront?',
      'How do I get started?',
    ];
    for (const question of questions) {
      expect(await screen.findByText(question)).toBeInTheDocument();
    }
  });

  it('renders the footer with privacy and terms links', () => {
    renderHome();

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});
