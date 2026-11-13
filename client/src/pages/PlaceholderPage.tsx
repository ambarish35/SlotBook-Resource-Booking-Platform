/** M0 placeholder. It states plainly that no booking features exist yet (DESIGN.md §9). */
export function PlaceholderPage() {
  return (
    <section aria-labelledby="page-title" className="rounded-lg border border-border bg-surface p-4 md:p-5">
      <h1 id="page-title" className="text-title-page-compact text-fg sm:text-title-page">
        SlotBook
      </h1>
      <p className="mt-2 max-w-prose text-copy-14 text-fg-secondary">
        The project foundation is running. Booking features aren't built yet; they arrive in later milestones.
      </p>
    </section>
  );
}
