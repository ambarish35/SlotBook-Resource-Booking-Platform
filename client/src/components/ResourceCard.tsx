import { Link } from 'react-router';
import { type Resource, TYPE_LABEL, describeResource } from '../lib/resources';
import { buttonClasses } from './Button';
import { Tag } from './Tag';

const MAX_TAGS_SHOWN = 3;

/**
 * A resource in the discovery grid (DESIGN.md §4 Cards). Only the title and the "View availability"
 * link are interactive; the card as a whole is not a click target.
 */
export function ResourceCard({ resource }: { resource: Resource }) {
  const shown = resource.tags.slice(0, MAX_TAGS_SHOWN);
  const hidden = resource.tags.length - shown.length;
  const href = `/resources/${resource.id}`;

  return (
    <li className="flex flex-col rounded-lg border border-border bg-surface p-4 hover:border-border-strong md:p-5">
      {/* flex-wrap: in a narrow card the type tag drops under the name instead of squeezing the name to a sliver. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h2 className="min-w-0 text-title-card break-words text-fg">
          <Link to={href} className="rounded-sm hover:underline">
            {resource.name}
          </Link>
        </h2>
        <Tag>{TYPE_LABEL[resource.type]}</Tag>
      </div>
      <p className="mt-1 text-label-13 text-fg-secondary">{describeResource(resource)}</p>
      {shown.length > 0 ? (
        <ul aria-label="Tags" className="mt-3 flex flex-wrap items-center gap-2">
          {shown.map((tag) => (
            <li key={tag}>
              <Tag>{tag}</Tag>
            </li>
          ))}
          {hidden > 0 ? <li className="text-label-12 text-fg-muted">+{hidden} more</li> : null}
        </ul>
      ) : null}
      <div className="mt-auto pt-4">
        <Link to={href} className={buttonClasses('secondary')}>
          View availability<span className="sr-only"> for {resource.name}</span>
        </Link>
      </div>
    </li>
  );
}
