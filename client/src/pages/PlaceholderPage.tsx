import { PageHeader } from '../components/PageHeader';

/**
 * A screen whose feature isn't built yet. It says so plainly and shows no sample data (DESIGN.md §9),
 * so signed-in users and the nav have somewhere honest to land until the milestone that builds it.
 */
export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="rounded-lg border border-border bg-surface p-4 md:p-5">
        <p className="max-w-prose text-copy-14 text-fg-secondary">{note}</p>
      </section>
    </>
  );
}
