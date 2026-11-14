import { useRef } from 'react';
import { Link, useParams } from 'react-router';
import { Button, buttonClasses } from '../components/Button';
import { Lozenge } from '../components/Lozenge';
import { Message } from '../components/Message';
import { PageHeader } from '../components/PageHeader';
import { SkeletonBlock } from '../components/Skeleton';
import { Tag } from '../components/Tag';
import { ApiError } from '../lib/api';
import { type Resource, TYPE_LABEL, describeResource } from '../lib/resources';
import { useApiData } from '../lib/useApiData';
import { useRetryFocus } from '../lib/useRetryFocus';

function BackLink() {
  return (
    <Link to="/resources" className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-md text-copy-14 text-accent underline md:min-h-0">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="m12 5-5 5 5 5" />
      </svg>
      All resources
    </Link>
  );
}

/**
 * One resource (DESIGN.md §5.4). This milestone shows its details only; choosing a date and booking
 * slots arrive in a later one, and the page says so rather than showing a fake grid (DESIGN.md §9).
 * The page header stays mounted through every state, so focus placed on the `h1` after navigation survives loading.
 */
export function ResourceDetailPage() {
  const { id = '' } = useParams();
  const { state, reload } = useApiData<Resource>(`/resources/${encodeURIComponent(id)}`);
  const resource = state.status === 'success' ? state.data : null;
  const notFound = state.status === 'error' && state.error instanceof ApiError && state.error.status === 404;
  const errorRef = useRef<HTMLDivElement>(null);
  // After "Try again": the heading on success, the message on failure.
  const markRetry = useRetryFocus(
    state.status,
    () => document.querySelector<HTMLElement>('main h1')?.focus(),
    () => errorRef.current?.focus(),
  );

  const title = resource ? resource.name : notFound ? 'Resource not found' : state.status === 'error' ? 'Resource' : 'Loading resource…';

  return (
    <>
      <BackLink />
      <PageHeader
        title={title}
        description={resource ? describeResource(resource) : undefined}
        badge={
          resource ? (
            <>
              <Tag>{TYPE_LABEL[resource.type]}</Tag>
              {/* Only admins can open an inactive resource; members get "not found". */}
              {!resource.isActive ? <Lozenge tone="warning">Inactive</Lozenge> : null}
            </>
          ) : undefined
        }
      />

      {state.status === 'loading' ? (
        <div aria-busy="true" className="rounded-lg border border-border bg-surface p-4 md:p-5">
          <span className="sr-only">Loading resource…</span>
          <SkeletonBlock className="h-5 w-1/3" />
          <SkeletonBlock className="mt-4 h-4 w-2/3" />
          <SkeletonBlock className="mt-2 h-4 w-1/2" />
        </div>
      ) : notFound ? (
        <div className="max-w-prose">
          <p className="text-copy-14 text-fg-secondary">
            It may have been removed or deactivated. Go back to the resources to find another.
          </p>
          <Link to="/resources" className={`${buttonClasses('primary')} mt-6`}>
            Go to resources
          </Link>
        </div>
      ) : state.status === 'error' ? (
        <Message
          ref={errorRef}
          variant="danger"
          role="alert"
          title="We couldn't load this resource"
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
      ) : resource ? (
        <div className="space-y-4">
          <section aria-label="Details" className="rounded-lg border border-border bg-surface p-4 md:p-5">
            {resource.tags.length > 0 ? (
              <ul aria-label="Tags" className="flex flex-wrap gap-2">
                {resource.tags.map((tag) => (
                  <li key={tag}>
                    <Tag>{tag}</Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-copy-14 text-fg-muted">No tags</p>
            )}
            {resource.description ? <p className="mt-4 max-w-prose text-copy-14 text-fg">{resource.description}</p> : null}
          </section>
          <Message variant="info" title="Booking isn't available yet">
            Choosing a date and booking times arrives in a later milestone.
          </Message>
        </div>
      ) : null}
    </>
  );
}
