import { Link } from 'react-router';
import { buttonClasses } from './Button';
import { PageHeader } from './PageHeader';

/** A full-page "no access" or "not found" state: a title, one sentence and one link back (DESIGN.md §8). */
export function FullPageMessage({ title, children }: { title: string; children: string }) {
  return (
    <section className="mx-auto max-w-116 py-12 text-center md:py-16">
      <PageHeader title={title} className="mb-2 justify-center" />
      <p className="text-copy-14 text-fg-secondary">{children}</p>
      <Link to="/resources" className={`${buttonClasses('primary')} mt-6`}>
        Go to resources
      </Link>
    </section>
  );
}
