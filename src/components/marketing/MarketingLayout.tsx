import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MARKETING_BRAND } from '../../data/marketingContent';

interface MarketingLayoutProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { href: '#workflow', label: 'Workflow' },
  { href: '#use-cases', label: 'Use cases' },
  { href: '#pricing', label: 'Pricing' },
  { href: '/demo', label: 'Live demo', external: false },
];

export function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="marketing-page min-h-screen bg-black text-neutral-200">
      <header className="sticky top-0 z-50 border-b border-neutral-800/80 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-xs font-bold text-violet-300">
              S
            </span>
            <span className="font-display text-sm font-semibold text-white">{MARKETING_BRAND.name}</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) =>
              link.external === false ? (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-xs text-neutral-400 transition-colors hover:text-white"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-xs text-neutral-400 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="#contact"
              className="hidden rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white sm:inline-flex"
            >
              Book assessment
            </a>
            <Link
              to="/demo"
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              Live demo
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-neutral-800 bg-[#0a0a0a] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-neutral-500">
            © {new Date().getFullYear()} {MARKETING_BRAND.name}. AI Operating Assistant for operations teams.
          </p>
          <div className="flex gap-4">
            <Link to="/demo" className="text-xs text-neutral-400 hover:text-white">
              Operations demo
            </Link>
            <a href="#contact" className="text-xs text-neutral-400 hover:text-white">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
