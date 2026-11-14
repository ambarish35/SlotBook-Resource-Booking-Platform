import { type Resource, TYPE_LABEL, describeResource } from '../lib/resources';
import { Button } from './Button';
import { Lozenge } from './Lozenge';
import { Tag } from './Tag';

interface ManageResourceListProps {
  resources: Resource[];
  /** The resource being reactivated right now, whose button shows a spinner. */
  reactivatingId: string | null;
  onEdit: (resource: Resource) => void;
  onDeactivate: (resource: Resource) => void;
  onReactivate: (resource: Resource) => void;
}

function StatusLozenge({ resource }: { resource: Resource }) {
  return resource.isActive ? <Lozenge tone="success">Active</Lozenge> : <Lozenge tone="warning">Inactive</Lozenge>;
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">No tags</span>
      </>
    );
  }
  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag}>
          <Tag>{tag}</Tag>
        </li>
      ))}
    </ul>
  );
}

/**
 * Edit, and Deactivate or Reactivate. The visible text comes first and the resource's name follows for screen
 * readers only (DESIGN.md §4 Tables), so every button in a list of rows has a distinct name.
 */
function RowActions({
  resource,
  reactivatingId,
  onEdit,
  onDeactivate,
  onReactivate,
  stacked,
}: Omit<ManageResourceListProps, 'resources'> & { resource: Resource; stacked: boolean }) {
  const size = stacked ? 'default' : 'compact';
  const name = <span className="sr-only"> {resource.name}</span>;
  return (
    <>
      <Button variant="secondary" size={size} fullWidth={stacked} onClick={() => onEdit(resource)}>
        Edit{name}
      </Button>
      {resource.isActive ? (
        <Button variant="subtle" size={size} fullWidth={stacked} onClick={() => onDeactivate(resource)}>
          Deactivate{name}
        </Button>
      ) : (
        <Button
          variant="subtle"
          size={size}
          fullWidth={stacked}
          loading={reactivatingId === resource.id}
          loadingLabel="Reactivating…"
          onClick={() => onReactivate(resource)}
        >
          Reactivate{name}
        </Button>
      )}
    </>
  );
}

// Tighter at 768 px, where seven columns have to fit without scrolling; roomier from 1024 px.
const headerCell = 'px-2.5 py-3 text-label-14 text-fg-secondary lg:px-4';
const cell = 'px-2.5 py-3 align-middle text-copy-14 text-fg lg:px-4';

/**
 * The resources as a table from 768 px and as cards below it, with no horizontal scrolling (DESIGN.md §4
 * Tables, §5.8). Both are in the page; CSS shows one, and the hidden one is out of the accessibility tree.
 */
export function ManageResourceList(props: ManageResourceListProps) {
  const { resources, ...actions } = props;
  return (
    <>
      {/* relative: the screen-reader-only text is absolutely positioned, so this must contain it or it escapes the scroll area and widens the page. */}
      <div className="relative hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Resources</caption>
          <thead className="bg-surface-subtle">
            <tr>
              <th scope="col" className={headerCell}>
                Name
              </th>
              <th scope="col" className={headerCell}>
                Type
              </th>
              <th scope="col" className={headerCell}>
                Location
              </th>
              <th scope="col" className={headerCell}>
                Capacity
              </th>
              <th scope="col" className={headerCell}>
                Tags
              </th>
              <th scope="col" className={headerCell}>
                Status
              </th>
              <th scope="col" className={`${headerCell} text-right`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {resources.map((resource) => (
              <tr key={resource.id} className="h-13">
                <th scope="row" className={`${cell} text-label-14 font-medium break-words`}>
                  {resource.name}
                </th>
                <td className={cell}>
                  <Tag>{TYPE_LABEL[resource.type]}</Tag>
                </td>
                <td className={`${cell} break-words`}>{resource.location}</td>
                <td className={`${cell} tabular-nums`}>
                  {resource.capacity === null ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">No capacity</span>
                    </>
                  ) : (
                    resource.capacity
                  )}
                </td>
                <td className={cell}>
                  <TagList tags={resource.tags} />
                </td>
                <td className={cell}>
                  <StatusLozenge resource={resource} />
                </td>
                <td className={cell}>
                  <div className="flex flex-col items-end gap-1 lg:flex-row lg:justify-end">
                    <RowActions {...actions} resource={resource} stacked={false} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {resources.map((resource) => (
          <li key={resource.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-title-card break-words text-fg">{resource.name}</h2>
              <StatusLozenge resource={resource} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tag>{TYPE_LABEL[resource.type]}</Tag>
              <p className="min-w-0 text-label-13 break-words text-fg-secondary">{describeResource(resource)}</p>
            </div>
            {resource.tags.length > 0 ? (
              <div className="mt-3">
                <TagList tags={resource.tags} />
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <RowActions {...actions} resource={resource} stacked />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
