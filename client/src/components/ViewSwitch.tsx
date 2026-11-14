import { Link, type To } from 'react-router';

export interface ViewSwitchItem {
  label: string;
  /** Usually a query string such as `{ search: '?status=inactive' }`, so the view can be bookmarked. */
  to: To;
  current: boolean;
}

/**
 * A view switch (DESIGN.md §4 Other parts): real links, the current one marked `aria-current="page"`, that
 * change a query parameter. No custom keyboard logic is needed. It is styled like the top navigation.
 */
export function ViewSwitch({ label, items }: { label: string; items: ViewSwitchItem[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex border-b border-border">
        {items.map((item) => (
          <li key={item.label} className="flex-1 md:flex-none">
            <Link
              to={item.to}
              aria-current={item.current ? 'page' : undefined}
              className={`-mb-px flex min-h-11 items-center justify-center border-b-2 px-4 text-label-14 md:min-h-10 ${
                item.current ? 'border-accent text-fg' : 'border-transparent text-fg-secondary hover:text-fg'
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
