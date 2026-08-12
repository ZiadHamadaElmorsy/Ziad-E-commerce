import { appConfig } from '@/lib/config';

/**
 * Phase 0 application shell.
 *
 * This is intentionally NOT the Storefront or the Admin experience — those
 * are built in later phases. This page only proves that the Next.js
 * foundation is wired correctly (App Router, environment configuration,
 * linting, type checking, testing, production build).
 */
export default function Home() {
  return (
    <div className="shell">
      <header className="shell__header">
        <span className="shell__brand">{appConfig.name}</span>
      </header>

      <main className="shell__main">
        <h1 className="shell__title">{appConfig.name}</h1>
        <p className="shell__lead">
          Phase 0 foundation is in place. The Storefront and Admin experiences are built in later
          phases.
        </p>

        <dl className="shell__meta">
          <div>
            <dt>API base URL</dt>
            <dd>
              <code>{appConfig.apiUrl}</code>
            </dd>
          </div>
        </dl>
      </main>

      <footer className="shell__footer">
        <span>Foundation ready.</span>
      </footer>
    </div>
  );
}
