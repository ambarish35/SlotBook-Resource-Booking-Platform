import { FullPageMessage } from '../components/FullPageMessage';

/** The 404 page (DESIGN.md §8). */
export function NotFoundPage() {
  return (
    <FullPageMessage title="Page not found">
      We couldn't find that page. Check the address, or go back to the resources.
    </FullPageMessage>
  );
}
