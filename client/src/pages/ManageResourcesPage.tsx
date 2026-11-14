import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../components/Button';
import { DeactivateDialog } from '../components/DeactivateDialog';
import { EmptyState } from '../components/EmptyState';
import { ManageResourceList } from '../components/ManageResourceList';
import { Message } from '../components/Message';
import { PageHeader } from '../components/PageHeader';
import { ResourceFormDialog } from '../components/ResourceFormDialog';
import { SearchField } from '../components/SearchField';
import { SelectField } from '../components/SelectField';
import { SkeletonBlock } from '../components/Skeleton';
import { ViewSwitch } from '../components/ViewSwitch';
import { ApiError, apiFetch } from '../lib/api';
import {
  type ManageFilters,
  type Resource,
  type StatusView,
  type TypeFilter,
  countLabel,
  filterManaged,
  parseStatusView,
  upsertResource,
} from '../lib/resources';
import { useApiData } from '../lib/useApiData';
import { useRetryFocus } from '../lib/useRetryFocus';

/** A result message at the top of the page (DESIGN.md §8). Success can be dismissed; a failure stays until the next try. */
interface Notice {
  variant: 'success' | 'danger';
  title: string;
  text: string;
}

const STATUS_LINKS: { view: StatusView; label: string; search: string }[] = [
  { view: 'active', label: 'Active', search: '?status=active' },
  { view: 'inactive', label: 'Inactive', search: '?status=inactive' },
  { view: 'all', label: 'All', search: '' },
];

/** Placeholder rows shaped like the table (desktop) and the cards (mobile) while the list loads. */
function LoadingRows() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading resources…</span>
      <div className="hidden rounded-lg border border-border bg-surface md:block">
        <SkeletonBlock className="h-11 rounded-b-none" />
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex h-13 items-center gap-6 border-t border-border px-4">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="ml-auto h-8 w-40" />
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-lg border border-border bg-surface p-4">
            <SkeletonBlock className="h-6 w-2/3" />
            <SkeletonBlock className="mt-3 h-4 w-1/2" />
            <SkeletonBlock className="mt-4 h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Manage resources (admins only, DESIGN.md §5.8): every resource, active or not, with Add, Edit, Deactivate
 * and Reactivate. The API enforces the admin role; the route guard only shapes the UI. Each change is sent to
 * the server first, and the row shows what the server confirmed.
 */
export function ManageResourcesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = parseStatusView(searchParams.get('status'));
  const { state, reload, mutate } = useApiData<Resource[]>('/resources?status=all');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [editor, setEditor] = useState<'add' | Resource | null>(null);
  const [deactivating, setDeactivating] = useState<Resource | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // After "Try again": the search field on success (or the heading if there are no resources), the message on failure.
  const markRetry = useRetryFocus(
    state.status,
    () => (searchRef.current ?? document.querySelector<HTMLElement>('main h1'))?.focus(),
    () => errorRef.current?.focus(),
  );

  // After the user's own action, focus moves to its result (DESIGN.md §7). This effect belongs to the page, so it
  // runs after a closing dialog's own effect has returned focus to its trigger, and so has the last word.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const catalog = state.status === 'success' ? state.data : null;
  const filters: ManageFilters = { query, type, status };
  const results = useMemo(() => (catalog ? filterManaged(catalog, { query, type, status }) : []), [catalog, query, type, status]);

  /** True when the current search, type or status would keep `resource` out of the list. */
  function hiddenByFilters(resource: Resource): boolean {
    return filterManaged([resource], filters).length === 0;
  }

  function clearFilters() {
    setQuery('');
    setType('all');
    void navigate({ search: '' });
  }

  function showSuccess(title: string, text: string, resource: Resource) {
    const hint = hiddenByFilters(resource) ? ' The current filters are hiding it; clear them to see it.' : '';
    setNotice({ variant: 'success', title, text: text + hint });
  }

  function handleSaved(resource: Resource, kind: 'added' | 'updated') {
    mutate((list) => upsertResource(list, resource));
    setEditor(null);
    if (kind === 'added') {
      showSuccess(`${resource.name} added`, 'Members can now find it under Resources.', resource);
    } else {
      showSuccess(
        `Changes to ${resource.name} saved`,
        resource.isActive ? 'Members see the changes straight away.' : "It is inactive, so members still can't see it.",
        resource,
      );
    }
  }

  function handleDeactivated(resource: Resource) {
    mutate((list) => upsertResource(list, resource));
    setDeactivating(null);
    showSuccess(`${resource.name} deactivated`, 'Members can no longer see or book it. You can reactivate it at any time.', resource);
  }

  async function reactivate(resource: Resource) {
    if (reactivatingId) return;
    setNotice(null);
    setReactivatingId(resource.id);
    try {
      const updated = await apiFetch<Resource>(`/resources/${resource.id}`, { method: 'PATCH', body: { isActive: true } });
      mutate((list) => upsertResource(list, updated));
      showSuccess(`${updated.name} reactivated`, 'Members can see it again.', updated);
    } catch (error) {
      const notFound = error instanceof ApiError && error.status === 404;
      setNotice({
        variant: 'danger',
        title: `We couldn't reactivate ${resource.name}`,
        text: notFound ? 'It no longer exists. Reload the page to see the current list.' : 'Nothing was changed. Check your connection and try again.',
      });
    } finally {
      setReactivatingId(null);
    }
  }

  function dismissNotice() {
    setNotice(null);
    document.querySelector<HTMLElement>('main h1')?.focus(); // the message is about to disappear
  }

  const hasResources = catalog !== null && catalog.length > 0;

  return (
    <>
      <PageHeader
        title="Manage resources"
        action={
          hasResources ? (
            <Button onClick={() => setEditor('add')} aria-haspopup="dialog">
              Add resource
            </Button>
          ) : undefined
        }
      />

      {notice ? (
        <div className="mb-4">
          <Message
            ref={noticeRef}
            variant={notice.variant}
            title={notice.title}
            onDismiss={notice.variant === 'success' ? dismissNotice : undefined}
          >
            {notice.text}
          </Message>
        </div>
      ) : null}

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
            <Button onClick={() => setEditor('add')} aria-haspopup="dialog">
              Add resource
            </Button>
          }
        >
          Add the first room or piece of equipment so members can find it.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start">
            <div className="md:w-96">
              <SearchField value={query} onChange={setQuery} inputRef={searchRef} caption="By name or location" />
            </div>
            <div className="md:w-48">
              <SelectField label="Type" value={type} onChange={(event) => setType(event.target.value as TypeFilter)}>
                <option value="all">All types</option>
                <option value="room">Rooms</option>
                <option value="equipment">Equipment</option>
              </SelectField>
            </div>
          </div>

          <div className="mb-4">
            <ViewSwitch
              label="Status"
              items={STATUS_LINKS.map(({ view, label, search }) => ({ label, to: { search }, current: status === view }))}
            />
          </div>

          {/* Always in the page, so screen readers announce the count when it changes. */}
          <p role="status" className="mb-3 text-label-14 text-fg-secondary">
            {catalog ? countLabel(results.length) : ''}
          </p>

          {!catalog ? (
            <LoadingRows />
          ) : results.length === 0 ? (
            <EmptyState
              title="No resources match"
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
              Try a different search or status, or clear the filters to see everything.
            </EmptyState>
          ) : (
            <ManageResourceList
              resources={results}
              reactivatingId={reactivatingId}
              onEdit={setEditor}
              onDeactivate={setDeactivating}
              onReactivate={reactivate}
            />
          )}
        </>
      )}

      <ResourceFormDialog target={editor} onClose={() => setEditor(null)} onSaved={handleSaved} />
      <DeactivateDialog resource={deactivating} onClose={() => setDeactivating(null)} onDeactivated={handleDeactivated} />
    </>
  );
}
