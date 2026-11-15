import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonClasses } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { Message } from '../components/Message';
import { PageHeader } from '../components/PageHeader';
import { ResourceCard } from '../components/ResourceCard';
import { ResourceFilters } from '../components/ResourceFilters';
import { SearchField } from '../components/SearchField';
import { SkeletonBlock } from '../components/Skeleton';
import { CountBadge } from '../components/Tag';
import { useSignedInUser } from '../lib/auth';
import { type Resource, NO_FILTERS, activeFilterCount, countLabel, filterResources } from '../lib/resources';
import { useApiData } from '../lib/useApiData';
import { useRetryFocus } from '../lib/useRetryFocus';

// DESIGN.md §5.3: 1 column, 2 from 768 px, 3 from 1024 px. The column counts are caps: each column is also at least
// 16 rem (14 rem from 1024 px) wide, so when the reader's text size is larger the cards get fewer, wider columns instead
// of being squeezed (the breakpoints are in pixels and don't know about the text size). `auto-fill` keeps a lone card
// the width of one column.
const gridClasses =
  'grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(min(100%,max(16rem,calc((100%_-_1rem)/2))),1fr))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,max(14rem,calc((100%_-_2rem)/3))),1fr))]';

/** Placeholder cards shaped like resource cards while the list loads. */
function LoadingCards() {
  return (
    <div aria-busy="true" className={gridClasses}>
      <span className="sr-only">Loading resources…</span>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rounded-lg border border-border bg-surface p-4 md:p-5">
          <SkeletonBlock className="h-6 w-2/3" />
          <SkeletonBlock className="mt-3 h-4 w-1/2" />
          <SkeletonBlock className="mt-4 h-6 w-3/4" />
          <SkeletonBlock className="mt-6 h-10 w-36" />
        </div>
      ))}
    </div>
  );
}

/** Resource discovery, the home page after sign-in (DESIGN.md §5.3). Search and filters run in the browser (PLAN.md D8). */
export function ResourcesPage() {
  const user = useSignedInUser();
  const { state, reload } = useApiData<Resource[]>('/resources');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sheetFocusRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // After "Try again": the search field on success (or the heading if there is no catalog), the message on failure.
  const markRetry = useRetryFocus(
    state.status,
    () => (searchRef.current ?? document.querySelector<HTMLElement>('main h1'))?.focus(),
    () => errorRef.current?.focus(),
  );

  // The sheet exists for narrow screens; from 768 px the filters are on the page, so close the sheet
  // if the window grows (a rotated tablet, say) instead of leaving a modal over duplicate controls.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)');
    const closeWhenWide = () => {
      if (wide.matches) setSheetOpen(false);
    };
    wide.addEventListener('change', closeWhenWide);
    return () => wide.removeEventListener('change', closeWhenWide);
  }, []);

  const catalog = state.status === 'success' ? state.data : null;
  const results = useMemo(() => (catalog ? filterResources(catalog, filters) : []), [catalog, filters]);
  const filterCount = activeFilterCount(filters);

  function clearFilters() {
    setFilters(NO_FILTERS);
  }

  return (
    <>
      <PageHeader title="Find a resource" />

      {state.status === 'error' ? (
        <Message
          ref={errorRef}
          variant="danger"
          role="alert"
          title="We couldn't load resources"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                markRetry();
                reload();
              }}
            >
              Try again
            </Button>
          }
        >
          Check your connection, then try again. If this keeps happening, the server may be down.
        </Message>
      ) : catalog?.length === 0 ? (
        <EmptyState
          title="No resources yet"
          action={
            user.role === 'admin' ? (
              <Link to="/admin/resources" className={buttonClasses('primary')}>
                Add resource
              </Link>
            ) : undefined
          }
        >
          {user.role === 'admin' ? 'Add the first room or piece of equipment so members can book it.' : 'An admin needs to add rooms or equipment.'}
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 max-w-2xl">
            <SearchField value={filters.query} onChange={(query) => setFilters({ ...filters, query })} inputRef={searchRef} />
          </div>

          <div className="mb-4 md:hidden">
            <Button variant="secondary" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
              Filters
              {filterCount > 0 ? (
                <CountBadge>
                  {filterCount}
                  <span className="sr-only"> active</span>
                </CountBadge>
              ) : null}
            </Button>
          </div>

          <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
            <section aria-label="Filters" className="mb-4 hidden rounded-lg border border-border bg-surface p-4 md:block lg:mb-0">
              <ResourceFilters filters={filters} onChange={setFilters} onClear={clearFilters} />
            </section>

            <div>
              {/* Always in the page, so screen readers announce the count when it changes. */}
              <p role="status" className="mb-3 text-label-14 text-fg-secondary">
                {catalog ? countLabel(results.length) : ''}
              </p>

              {!catalog ? (
                <LoadingCards />
              ) : results.length === 0 ? (
                <EmptyState
                  title="No resources match your filters"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        clearFilters();
                        searchRef.current?.focus(); // the button is about to disappear
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                >
                  Try a different search, or clear the filters to see everything.
                </EmptyState>
              ) : (
                <ul className={gridClasses}>
                  {results.map((resource) => (
                    <ResourceCard key={resource.id} resource={resource} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <Dialog
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Filters"
            sheetBelow="md"
            initialFocus={sheetFocusRef}
            footer={
              <>
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
                <Button onClick={() => setSheetOpen(false)}>
                  {catalog ? `Show ${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'Show results'}
                </Button>
              </>
            }
          >
            <ResourceFilters filters={filters} onChange={setFilters} stacked firstFieldRef={sheetFocusRef} />
          </Dialog>
        </>
      )}
    </>
  );
}
