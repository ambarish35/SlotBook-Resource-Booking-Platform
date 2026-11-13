import { FullPageMessage } from '../components/FullPageMessage';

/** The 403 page (DESIGN.md §8). Shown in place when a member opens an admin page. */
export function ForbiddenPage() {
  return (
    <FullPageMessage title="You don't have access to this page">
      This page is for admins. If you need access, ask an admin to change your role.
    </FullPageMessage>
  );
}
