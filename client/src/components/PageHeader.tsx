import { type ReactNode, useEffect } from 'react';

interface PageHeaderProps {
  /** The page's `h1`, also used for the document title ("My bookings · SlotBook"). */
  title: string;
  description?: string;
  /** The page's primary action: on the right on desktop, below the title on mobile. */
  action?: ReactNode;
  className?: string;
}

/**
 * Each page renders exactly one of these. It sets the document title and renders the `h1`, which
 * has tabIndex -1 so that RootLayout can move focus to it after every route change (DESIGN.md §5.1).
 */
export function PageHeader({ title, description, action, className = 'mb-6' }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · SlotBook`;
  }, [title]);

  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 tabIndex={-1} className="text-title-page-compact text-fg sm:text-title-page">
          {title}
        </h1>
        {description ? <p className="mt-1 text-copy-14 text-fg-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
