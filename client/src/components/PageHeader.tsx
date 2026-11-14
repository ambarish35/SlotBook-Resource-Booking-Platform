import { type ReactNode, useEffect } from 'react';

interface PageHeaderProps {
  /** The page's `h1`, also used for the document title ("My bookings · SlotBook"). */
  title: string;
  description?: string;
  /** A tag or lozenge shown beside the title, such as a resource's type. */
  badge?: ReactNode;
  /** The page's primary action: on the right on desktop, below the title on mobile. */
  action?: ReactNode;
  className?: string;
}

/**
 * Each page renders exactly one of these. It sets the document title and renders the `h1`, which
 * has tabIndex -1 so that RootLayout can move focus to it after every route change (DESIGN.md §5.1).
 */
export function PageHeader({ title, description, badge, action, className = 'mb-6' }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · SlotBook`;
  }, [title]);

  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 tabIndex={-1} className="text-title-page-compact break-words text-fg sm:text-title-page">
            {title}
          </h1>
          {badge}
        </div>
        {description ? <p className="mt-1 text-copy-14 text-fg-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
