# SlotBook — Design

> **Status: Planning.** This is the design spec for the MVP in [PLAN.md](PLAN.md). Nothing here is built yet.

## 1. References

The references were checked on 2026-11-13 with a web-fetch tool that reads page text only. No screenshots were taken, so visual details that aren't described in text weren't seen. SlotBook's values are its own: no logos, brand colors, typefaces, icons or component code were copied.

| Reference | What could be read | Principles used |
|---|---|---|
| **Geist** (primary visual reference), vercel.com/geist/introduction | The introduction, which is an overview, plus the Colors, Typography and Materials pages through their `.md` versions. Not read: individual component pages, Grid, Icons. These pages give no hex values. | Color tokens grouped by role: component backgrounds (default, hover, active), borders (default, hover, active), high-contrast fills, text. One main background plus a secondary one used sparingly. 14 px as the default UI and body size, with 13 and 12 px for secondary and tertiary text. Single-line "label" styles kept separate from multi-line "copy" styles. Tabular numbers for figures. A few surface presets whose radius and shadow increase with elevation. |
| **Atlassian Design System**, atlassian.design/components | The components index (names and one-line descriptions). The main component pages came back empty to the fetch tool. Their **Usage** pages could be read for Modal dialog, Section message, Empty state, Lozenge and Button; the end of the Button page was cut off. Not read: date time picker, table, tabs, flag, banner, spinner, skeleton. | Modal anatomy, button order and focus behavior. Section messages that name the problem and say how to proceed. Empty-state anatomy. Lozenge for status, tag for metadata, badge for counts. One primary button per area. Sentence-case action labels. Avoid disabled buttons in forms. |
| **Primer accessibility**, primer.style/accessibility/design-guidance/ | The overview plus Color considerations, Focus management, Links and buttons, Motion and animation, App-like web experiences, Text resize and spacing, and the Accessible notifications and Placeholders pattern pages. | WCAG 2.2 AA contrast, including 3:1 for input borders and selected states. Never rely on color alone. Visible focus and deliberate focus movement. Links navigate, buttons act. `aria-disabled` instead of `disabled`, and submit buttons are never disabled. No toasts; failures are always announced. On route changes, focus the heading and update the page title. Visible labels instead of placeholders. Content survives 200% zoom without truncation. Motion only under `prefers-reduced-motion: no-preference`. |

## 2. Principles

1. **App first.** Signing in leads straight to resource discovery. There is no landing page, hero section or marketing copy.
2. **Calm and neutral.** Light canvas, white surfaces, near-black text. One restrained blue is reserved for primary actions, selection, links and focus.
3. **Clear hierarchy, moderate density.** 14 px UI text, 40 px controls, 44 px touch targets on small screens, one primary action per area.
4. **Never color alone.** Every state also has a word, an icon or a change of shape.
5. **No decoration.** No gradients, illustrations, glass effects, or animation other than a loading spinner.
6. **Honest UI.** Real screens show real API data; sample-data previews are labelled (§9).

## 3. Tokens

The tokens are defined once as Tailwind v4 `@theme` variables (for example `--color-surface` becomes `bg-surface`). Don't add colors, fonts or shadows beyond this list.

### Color

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F6F7F9` | App background |
| `surface` | `#FFFFFF` | Cards, tables, dialogs, inputs, available slots |
| `surface-subtle` | `#F0F2F5` | Table headers, booked slots, skeletons, read-only fields |
| `border` | `#E2E5EA` | Dividers, card and table outlines (decorative) |
| `border-strong` | `#868D99` | Input borders, outline of available slots |
| `fg` | `#16181D` | Primary text, headings |
| `fg-secondary` | `#4A505B` | Secondary text, labels on subtle fills |
| `fg-muted` | `#5E6571` | Captions, helper text, past slots |
| `fg-disabled` | `#A0A6AF` | Disabled controls only, never for information |
| `accent` | `#2A5BD7` | Primary buttons, links, selected slots, focus ring |
| `accent-hover` | `#2149B5` | Primary hover; text on `accent-subtle` |
| `accent-active` | `#1C3E9A` | Primary pressed |
| `accent-subtle` | `#EBF1FE` | Hover on available slots, "Your booking" slots, info messages |
| `success`, `success-subtle` | `#1E7B3D`, `#EAF6EE` | Success text and icons; their background |
| `warning`, `warning-subtle` | `#8A5300`, `#FFF6E3` | Conflict text and icons; their background |
| `danger`, `danger-subtle` | `#BF3A30`, `#FDEEEC` | Errors and danger buttons; their background |
| `danger-hover` | `#A1302A` | Danger button hover |
| `overlay` | `#16181D` at 50% | Dialog backdrop |

Message borders are decorative: success `#A8D8B6`, warning `#EFCB82`, danger `#F0B6AF`, info `#B8CCF6`.

**Contrast:** computed for this palette with the WCAG 2.x formula on 2026-11-13.
- Every text pair is at least 4.5:1. For example: `fg` on `surface` 17.76, `fg-muted` on `surface-subtle` 5.24, `accent` on `surface` 5.87, white on `accent` 5.87, `accent-hover` on `accent-subtle` 6.91, white on `danger` 5.44. Success, warning and danger text on their tints measure 4.78, 5.89 and 4.82.
- Non-text elements are at least 3:1. `border-strong` measures 3.34 on `surface` and 3.12 on `canvas`. The `accent` focus ring measures 5.87 on `surface` and 5.48 on `canvas`.
- `fg-disabled` measures 2.45:1, which is why it is used only for disabled controls.

### Typography

Use the system UI font stack (Tailwind's default `font-sans`): no web-font download and no borrowed brand typeface. Times and dates use `tabular-nums`. Text is sentence case everywhere, never all caps. Sizes are set in `rem`.

| Style | Size / line height (px) | Weight | Use |
|---|---|---|---|
| `title-page` | 24/32 (20/28 below 640 px) | 600 | Page `h1` |
| `title-section` | 18/28 | 600 | Section `h2`, dialog titles |
| `title-card` | 16/24 | 600 | Card titles, summary panel title |
| `label-14` | 14/20 | 500 | Buttons, form labels, nav, table headers |
| `copy-14` | 14/22 | 400 | Body text, descriptions, table cells |
| `label-13` | 13/18 | 400 | Metadata (location, capacity), helper text |
| `label-12` | 12/16 | 500 | Lozenges, tags, slot status words |
| Input text | 16 below 640 px, otherwise 14 | 400 | Prevents iOS from zooming in on focus |

### Spacing, sizes, radius, elevation, layout

- **Spacing:** 4 px base, using 4, 8, 12, 16, 20, 24, 32 and 48.
  - Page gutters: 16 on mobile, 24 at ≥ 768 px. Content max width: 1200 px.
  - Card padding: 16, or 20 at ≥ 768 px. Dialog padding: 20, or 24 at ≥ 768 px.
  - Gaps: 8 inside a group, 16 between fields, 24 between sections.
- **Sizes:** controls are 40 px high (32 px for table-row actions on desktop). Below 768 px every touch target is at least 44 × 44 px. Slot cells are at least 52 px high.
- **Radius:**

  | Token | Value | Used on |
  |---|---|---|
  | `sm` | 4 px | Checkboxes |
  | `md` | 6 px | Buttons, inputs, slots, tags |
  | `lg` | 8 px | Cards, tables, messages |
  | `xl` | 12 px | Dialogs, sheets, menus |
  | `full` | — | Lozenges |

- **Elevation:** surfaces sit flat with a 1 px `border` and no shadow. Two shadows exist:
  - `shadow-raised`: `0 1px 2px rgb(22 24 29 / 6%), 0 4px 12px rgb(22 24 29 / 6%)`, for the sticky mobile summary bar and menus.
  - `shadow-overlay`: `0 8px 16px rgb(22 24 29 / 10%), 0 24px 48px rgb(22 24 29 / 16%)`, for dialogs and sheets.
- **Breakpoints:** Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280), designed mobile-first.
- **Focus ring:** `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }` on every interactive element. It is never removed.
- **Motion:** none. Hover and state changes are instant, and dialogs open without animation. The only animation is the spinner, and it runs only under `prefers-reduced-motion: no-preference`. Otherwise a static icon with "Loading…" is shown.

## 4. Components

### Buttons

| Variant | Look | Use |
|---|---|---|
| Primary | `accent` fill, white text; hover `accent-hover`; pressed `accent-active` | The single main action in an area: "Sign in", "Review booking", "Confirm booking", "Save changes" |
| Secondary | `surface` fill, 1 px `border-strong`, `fg` text; hover `surface-subtle` | Alternatives: "Go back", "Edit", "Clear filters" |
| Subtle | No fill, `fg-secondary` text; hover `surface-subtle` | Low emphasis and icon buttons: "Previous day", "Clear selection" |
| Danger | `danger` fill, white text; hover `danger-hover` | Only the confirming action of a destructive dialog: "Cancel booking", "Deactivate" |
| Link | `accent` text, underlined | Navigation inside text |

- **Links navigate, buttons act.** "View availability" and "View my bookings" are `<a>` elements even when they look like buttons. Anything that changes data or opens a dialog is a `<button>`.
- **Labels:** a sentence-case verb and noun, specific and dynamic where that helps ("Book 2 slots"), with no closing punctuation.
- **Loading:** a spinner and a progress label ("Booking…"), `aria-disabled="true"`, the same width as before, and repeat clicks ignored.
- **Disabled:** avoid it. Submit buttons are never disabled; validate on submit instead. When an action needs an obvious earlier step (for example "Review booking" with nothing selected), use `aria-disabled="true"` and show the reason as visible text next to the button. Never put tooltips on disabled buttons.
- **Icon-only buttons** (Previous day, Next day, Close, Menu): 40 px square (44 px on mobile), an `aria-label` naming the action, and the icon marked `aria-hidden="true"`.
- **Placement:** dialog footers are right-aligned with the primary button rightmost. Page forms and cards are left-aligned. Sign-in form buttons are full width.

### Inputs

- Every field has a visible `<label>` above it (`label-14`). Optional helper text sits below (`label-13`, `fg-muted`) and is linked with `aria-describedby`. Optional fields say "(optional)" instead of marking required ones with asterisks.
- Placeholders never stand in for labels. Avoid them; when guidance helps, use a persistent caption instead.
- Fields are 40 px high, with a `surface` fill, 1 px `border-strong`, radius `md` and 12 px horizontal padding. On focus they show the focus ring and an `accent` border. Read-only fields use a `surface-subtle` fill.
- **Invalid fields:** a `danger` border, `aria-invalid="true"`, and a message below with an error icon and text (for example "Enter a capacity of 1 or more"), linked by `aria-describedby`. Validate on submit, and on blur after the first submit, never on every keystroke.
- Use native controls: `<select>`, `<input type="date">`, radios, checkboxes, and `type="search"` (with a clear button only while there is text).

### Cards

- A `surface` fill, 1 px `border`, radius `lg`, padding 16/20, no shadow. On hover, a resource card's border becomes `border-strong`.
- **Resource card:** the title as a link (`title-card`), a type tag, a metadata line ("Block A, 2nd floor · Seats 8"), up to three tags followed by "+2 more", and a "View availability" link-button. Only the title and that link are interactive; the card as a whole is not a click target.

### Badges

| Kind | Look | Examples |
|---|---|---|
| Lozenge (status) | Pill, `label-12`, tinted background with matching text | Confirmed (success), In progress (accent), Completed (neutral), Cancelled (neutral), Active (success), Inactive (warning), Admin (accent) |
| Tag (metadata) | Radius `md`, 1 px `border`, `surface`, `label-12` in `fg-secondary` | Room, Equipment, Projector, Whiteboard |
| Count | Pill, `surface-subtle`, tabular `label-12` | Number of active filters on the mobile "Filters" button |

Neutral means a `surface-subtle` background with `fg-secondary` text. Badges are never interactive, use one or two words, are never truncated, and the word itself carries the meaning.

### Dialogs

- Use the native `<dialog>` opened with `showModal()`. Only one dialog is open at a time, and no dialog opens another.
- **Anatomy:** a header (`h2` title and a Close icon button), a short body, and a right-aligned footer (secondary, then primary).
- **Width:** 480 px for confirmations, 640 px for forms. Below 640 px a dialog becomes a full-width bottom sheet with radius `xl` on its top corners, at most 90% of the viewport height, a scrolling body and a sticky footer.
- **Focus:**
  - On open, focus moves to the first field. In a text-only confirmation it moves to the title (`tabindex="-1"`). It never starts on a destructive button.
  - On close, focus returns to the trigger, unless a result message appears; then focus moves to the message.
- **Dismiss:** with Close, Esc, a click on the backdrop, or the secondary button, except while a request is in progress.
- **Errors:** request errors appear as a danger message inside the dialog. Booking conflicts follow §5.6 instead.

### Tables

- Tables are used at ≥ 768 px for My bookings and Manage resources. Below 768 px the same rows become stacked cards, with no horizontal scrolling.
- **Look:**
  - The table sits inside a `surface` card with radius `lg`.
  - The header row uses `surface-subtle` with `label-14` in `fg-secondary`.
  - Rows are at least 52 px high, separated by 1 px `border` dividers, with cells padded 12/16.
  - Times are tabular, and actions are right-aligned.
- **Markup:** a semantic `<table>` with a `<caption>` (it may be visually hidden), `<th scope="col">` headers, and the resource name as `<th scope="row">`.
- Row actions keep their visible text first and add context for screen readers. For example, visible "Cancel" followed by hidden " booking: Room A, Sat 14 Nov, 10:00–11:00 IST".
- The MVP has no sorting or pagination. Upcoming lists show the soonest first and history the newest first, limited to the latest 50 rows with the note "Showing the latest 50".

### Messages (section messages)

- Persistent inline messages at the top of the region they relate to: an icon, a title (`label-14` semibold), one or two sentences, and an optional action.
- The variants are info, success, warning and danger. Each has its own icon shape (circle-i, check, triangle, octagon), so color isn't the only cue.
- **Writing:** the title names the situation. The description says what happened and what to do next, so there are no dead ends. When the system is at fault, say so ("We couldn't load…").
- **Persistence:** success messages can be dismissed. Errors and warnings stay until the problem is resolved.
- **No toasts.**

### Other parts

- **Skeletons:** static `surface-subtle` blocks shaped like the content, with no shimmer. The container has `aria-busy="true"` and visually hidden "Loading…" text.
- **Spinner:** 16 px in buttons and 24 px in regions, always next to text.
- **View switches** (Upcoming / History, Mine / All members): links with `aria-current="page"` that change a query parameter. They are real navigation, can be bookmarked, and need no custom keyboard logic.
- **Empty state:** a centered stack at most 464 px wide, with a title (required), one sentence and at most one primary action. No illustrations.

## 5. Screens

### 5.1 App shell

- **Top bar:** 56 px high, `surface` fill, bottom `border`.
  - Left: the text wordmark "SlotBook" in weight 600, linking to `/resources`.
  - Nav links: "Resources", "My bookings", and for admins "Manage resources". The current link has `fg` text, a 2 px `accent` underline and `aria-current="page"`.
  - Right: the user's name, an Admin lozenge when relevant, and "Sign out".
- The first focusable element is a "Skip to main content" link.
- On every route change, update `document.title` (for example "My bookings · SlotBook") and move focus to the page's `h1` (`tabindex="-1"`).
- **Page header:** the `h1`, an optional one-line description, and the page's primary action, on the right on desktop or below the title on mobile.
- **Mobile:** the wordmark and a "Menu" button (`aria-expanded`). The button opens the nav as a full-width list under the bar, and Sign out is included there.

### 5.2 Sign in and register

- A centered `surface` card (at most 400 px wide) on `canvas`, with the wordmark above it.
  - **Sign in:** Email, Password, a full-width "Sign in" button, and a "Create an account" link.
  - **Register:** Name, Email, Password (caption "At least 8 characters"), and "Create account".
- Wrong credentials show the danger message "Email or password is incorrect." above the fields, and focus moves to it.
- **Mobile:** the card fills the width inside the 16 px gutters.

### 5.3 Resource discovery (`/resources`)

```
Find a resource
[ Search by name, location or tag ................................ ]
+-- Filters -----------+   9 resources
| Type                 |   +----------------+ +----------------+ +----------------+
| (o) All              |   | Room A  [Room] | | Projector 2    | | Huddle 3 [Room]|
| ( ) Rooms            |   | Block A · 8    | | [Equipment]    | | Block B · 4    |
| ( ) Equipment        |   | View avail.    | | View avail.    | | View avail.    |
| Minimum capacity     |   +----------------+ +----------------+ +----------------+
| [ Any          v ]   |
| Clear filters        |
+----------------------+
```

- Filters apply instantly in the browser, and focus stays on the control being changed. The result count is a `role="status"` region ("9 resources").
- Minimum capacity is hidden when Type is Equipment.
- **Grid:** 3 columns at ≥ 1024 px with the filters in a 240 px left column; 2 columns at 768–1023 px with the filters in a row above the results; 1 column below that.
- **Order:** rooms first, then equipment, each alphabetical.
- **Mobile:** a full-width search field and a "Filters" button showing the count of active filters. The button opens a bottom sheet with the same controls plus "Show 9 results" and "Clear filters".
- **States:**
  - Loading: skeleton cards.
  - Empty catalog: "No resources yet", followed for members by "An admin needs to add rooms or equipment." and for admins by an "Add resource" action.
  - No results: "No resources match your filters" with "Clear filters".
  - Error: "We couldn't load resources" with "Try again".

### 5.4 Resource detail (`/resources/:id`)

```
< All resources
Room A  [Room]          Block A, 2nd floor · Seats 8 · Projector, Whiteboard
+-- Choose a date --------------------------------------+  +-- Your selection ------------+
| [<]  [ 14/11/2026 ]  [>]   [Today]                    |  | Sat, 14 Nov 2026             |
| All times IST (UTC+05:30)                             |  | 10:00-11:00 IST   2 slots  x |
| Available | Selected | Booked | Your booking | Past   |  | 14:00-14:30 IST   1 slot   x |
| Morning    08:00 08:30 09:00 09:30 10:00 10:30 ...    |  | Total 1 h 30 min             |
| Afternoon  12:00 12:30 ...                    15:30   |  | [ Review booking ]           |
| Evening    16:00 16:30 ...                    19:30   |  | Clear selection              |
+-------------------------------------------------------+  +------------------------------+
```

- **Layout:** two columns at ≥ 1024 px, with the grid taking about two-thirds and a sticky summary the remaining third.
- **Slot groups:** three labelled groups of 8 slots: Morning 08:00–11:30, Afternoon 12:00–15:30, Evening 16:00–19:30. They use 8 columns at ≥ 1024 px and 4 columns below, which gives two rows per group.
- **Date control:** a native date input (min = today in IST, max = today + 30), "Previous day" and "Next day" icon buttons, and "Today". A selection belongs to one date: changing the date clears it, and the summary warns about this beforehand ("Changing the date clears your selection").
- **Fully booked day:** an empty state in the grid area, "No free times on Sat, 14 Nov", with "Next day".
- **Unknown or inactive resource:** a "Resource not found" page with a link back to resources.
- **Mobile:**
  - One column: the header, a date row (44 px buttons around a flexible date input), then the slot groups in 4 columns.
  - The summary becomes a sticky bottom bar (`shadow-raised`, with safe-area padding) showing "2 slots · 10:00–11:00 IST" and a "Review" button.
  - The bar is hidden while nothing is selected, and the page adds bottom padding so the bar never covers slots.
  - "Review" opens the confirmation as a bottom sheet.

### 5.5 Booking summary and confirmation

- **Summary with nothing selected:** "No times selected" and "Select one or more available times, up to 8 slots (4 hours)." "Review booking" is `aria-disabled`, and that sentence is its visible reason.
- **Summary with a selection:**
  - Shows the date and the selected slots, with consecutive slots merged into ranges ("10:00–11:00 IST · 2 slots"). Each range has a "Remove" icon button (`aria-label="Remove 10:00–11:00"`).
  - Shows the total duration, with "Review booking" (primary) and "Clear selection" (subtle) below.
  - A `role="status"` line announces changes ("3 slots selected").
  - Picking a 9th slot leaves the selection unchanged and shows "You can book up to 8 slots at a time."
- **Confirmation dialog:** titled "Confirm booking". The body lists the resource (name, type, location), the date, the time ranges, the total and "All times IST". The footer has "Go back" and "Confirm booking".
- **While submitting:** the button reads "Booking…" with a spinner, and the dialog can't be dismissed.
- **Success:**
  - The dialog closes and a success message appears above the grid: "Booking confirmed · Room A · Sat, 14 Nov 2026 · 10:00–11:00 IST", with a "View my bookings" link. Focus moves to the message.
  - The grid refreshes, so those slots now read "Your booking", and the selection clears.
- **Other failures** (network errors, 500): the dialog stays open with a danger message, "We couldn't complete your booking. Nothing was booked. Try again." The buttons become active again.
- **Expired session (401):** go to sign in, then return to the same resource and date.

### 5.6 Booking conflicts (409 `SLOT_UNAVAILABLE`)

If even one selected slot is unavailable, the server rejects the whole booking and books nothing, so there is never a partial booking. The UI keeps the remaining selections only so the user can edit them; nothing is reserved until the user confirms again.

1. Close the confirmation dialog.
2. Fetch availability for the date again. Do this every time, even though the response already lists the conflicting slots.
3. Remove every selected slot that is no longer available (booked or past), and **keep every other selection**.
4. Show the slots that were just taken in the "Just taken" style until the selection or the date changes.
5. Show a warning message above the grid and move focus to it.
   - Title: "Some times are no longer available".
   - Body: "10:30–11:00 IST was booked by someone else while you were choosing. Nothing was booked. We refreshed the times and kept your other 2 selections." For a past slot, the body says the time "has already started" instead.
   - If no selection is left: "None of your selected times are available now. Choose other times."
6. The user adjusts the selection and reviews again as usual.

- If the refresh fails, show the danger message "We couldn't refresh the times" with "Try again", and keep the selections.
- Never drop selections silently, never book the remaining slots automatically, and never show a generic error for a conflict.

### 5.7 My bookings (`/bookings`)

- The `h1` "My bookings" and the view links "Upcoming" and "History". Admins also get "Mine" and "All members".
- **Table columns:** Resource (name and type tag), Date, Time (IST), Duration, Status, Booked by (admin All members view only), Actions.
- **Upcoming** shows confirmed bookings that haven't ended, soonest first. Bookings that have started show "In progress" and no Cancel action. **History** shows completed and cancelled bookings, newest first.
- **Cancel:**
  - "Cancel" opens a dialog titled "Cancel this booking?". The body shows the booking summary and "Its time slots will become available to others." The footer has "Keep booking" and "Cancel booking" (danger).
  - On success the row leaves Upcoming, and a success message ("Booking cancelled · Room A · Sat, 14 Nov · 10:00–11:00 IST") appears at the top with focus.
  - If the API says the booking can't be cancelled (already cancelled or started), the dialog explains why and the list refreshes.
  - If the API returns 404 (for example after signing in as someone else in another tab), the dialog says "We couldn't find this booking" and the list refreshes.
- **Mobile:** one card per booking (resource and tag, date, time, status lozenge) with a full-width "Cancel booking" secondary button. The view links fill the width.
- **States:**
  - Loading: skeleton rows or cards.
  - Empty Upcoming: "No upcoming bookings" with "Find a resource".
  - Empty History: "No past or cancelled bookings yet".
  - Error: "We couldn't load your bookings" with "Try again".

### 5.8 Manage resources (`/admin/resources`, admins only)

- The `h1` "Manage resources" with the primary action "Add resource". A toolbar holds search (name or location), a Type select, and status links (Active / Inactive / All).
- **Table columns:** Name, Type, Location, Capacity ("—" for equipment), Tags, Status (Active or Inactive lozenge), and Actions ("Edit" as secondary, "Deactivate" or "Reactivate" as subtle).
- **Add and Edit dialog (640 px):**
  - Fields: Name, Type (radios: Room or Equipment), Location, Capacity (rooms only, a whole number ≥ 1), Description (optional), Tags (optional, with the caption "Separate with commas, e.g. Projector, Whiteboard").
  - Footer: "Cancel" and "Add resource" (or "Save changes" when editing).
  - Server errors appear on the matching field ("A resource with this name already exists").
- **Deactivate dialog:**
  - Title: "Deactivate Room A?"
  - Body: "Members won't see it or be able to book it. Existing bookings stay; cancel them from My bookings → All members if needed."
  - Footer: "Keep active" and "Deactivate" (danger).
  - Reactivating needs no confirmation.
- After a save, deactivation or reactivation, a success message appears at the top with focus, and the row updates.
- **Mobile:** cards showing name, tags, metadata and status, with full-width "Edit" and "Deactivate" buttons. The form opens as a full-screen sheet with a sticky footer.
- **States:** loading; empty ("No resources yet" with "Add resource"); no matches ("No resources match" with "Clear filters"); error.

## 6. Slot states

| State | Look | Visible text | Semantics | Interaction |
|---|---|---|---|---|
| Available | `surface`, 1 px `border-strong`; on hover `accent-subtle` with an `accent` border | "10:00" | `<button aria-pressed="false">` | Click, Space or Enter selects it |
| Selected | `accent` fill, white text, check icon | "10:00" and "Selected" | `aria-pressed="true"`; the word "Selected" is `aria-hidden` because the pressed state is already announced | The same keys deselect it |
| Unavailable | `surface-subtle`, no border, `fg-secondary` text | "10:00" and "Booked" | `aria-disabled="true"`; still focusable | None |
| Unavailable, yours | `accent-subtle`, `accent-hover` text | "10:00" and "Your booking" | `aria-disabled="true"` | None |
| Unavailable, just taken | `warning-subtle`, 1 px warning border, `warning` text | "10:00" and "Just taken" | `aria-disabled="true"` | None; becomes "Booked" at the next change |
| Past | No fill, 1 px dashed `border`, `fg-muted` text | "10:00" and "Past" | `aria-disabled="true"` | None |

- Accessible names start with the visible time, then add the range and the state, for example "10:00 to 10:30 IST, booked".
- A legend above the grid shows every state with its label.
- Hover and focus never make an unavailable or past slot look selectable.

## 7. Keyboard, focus and labels

- **Global:** a skip link; DOM order that matches the visual order; every action works from the keyboard; a visible `:focus-visible` ring everywhere.
- **Slot grid:** one Tab stop, using a roving `tabindex`.
  - Focus enters on the first selected slot, or on the first available one if nothing is selected.
  - ← and → move to the previous and next slot. ↑ and ↓ move within the same column to the previous and next row (8 or 4 columns, as rendered). Home and End jump to the day's first and last slot.
  - Space or Enter toggles an available or selected slot. Unavailable and past slots can receive focus and announce their state, but they don't toggle.
  - Tab moves on to the summary.
- **Dialogs:** focus moves into the dialog and stays inside it (`showModal`). Esc closes it, except while submitting. Focus then returns as described in §4.
- **Forms:** Enter submits. When validation fails, focus moves to the first invalid field, and its error is announced through `aria-describedby`.
- **Announcements:**
  - After the user's own actions (success, conflict, failure), focus moves to the resulting message.
  - Background updates such as the result count use `role="status"`.
  - A failed page load uses `role="alert"`.
- **Labels:** every input has a `<label>`; icon-only buttons have an `aria-label`; decorative SVGs are `aria-hidden="true"`; each page has one `h1` and properly ordered headings; the document sets `<html lang="en">`.
- **Zoom:** everything works at 200% zoom and at 320 px wide, with no horizontal scrolling and no clipped text. Text containers never have fixed heights, and long names wrap instead of being truncated.

## 8. States at a glance

| State | Pattern | Example copy |
|---|---|---|
| Loading | Skeleton shaped like the content; spinner with text inside buttons | "Loading resources…" (visually hidden), "Booking…" |
| Empty | Empty state: title, one sentence, at most one action | "No upcoming bookings" · "Find a resource" |
| Validation | Inline field errors on submit; focus on the first invalid field | "Enter a capacity of 1 or more" |
| Error | Danger message saying what failed, with "Try again" | "We couldn't load your bookings." |
| Success | Dismissible success message at the top of the region, focused | "Booking confirmed · Room A · …" |
| Conflict | Warning message and refreshed grid (§5.6) | "Some times are no longer available" |
| No access, not found | Full-page message with a link back | "You don't have access to this page" |

## 9. Sample data vs working functionality

- **Working functionality** means the screen uses the real API and MongoDB. Only working functionality counts as done in PLAN.md, appears in screenshots, or is described as a feature in the README.
- **Demo data** (the seeded resources, demo accounts and demo bookings) is real data in the database. The README calls it "demo data".
- **Sample-data previews** are screens fed by hard-coded fixtures while layouts are being built. They are allowed only during development, and each one must:
  - live under a dev-only route (`/__preview/…`) that is excluded from production builds;
  - show a persistent warning banner: "Preview — sample data. Not connected to the server. Actions are disabled.";
  - give every action `aria-disabled="true"`;
  - never be presented as a working feature.

## 10. Mobile summary (below 768 px)

| Screen | Adaptation |
|---|---|
| App shell | A Menu button reveals the nav list, which includes Sign out |
| Sign in, register | The card fills the width inside 16 px gutters |
| Discovery | One column of cards, full-width search, filters in a bottom sheet |
| Resource detail | One column, 4-column slot groups, a sticky bottom selection bar, the confirmation as a bottom sheet |
| My bookings | Cards instead of a table, with a full-width Cancel button |
| Manage resources | Cards instead of a table; the form opens as a full-screen sheet with a sticky footer |

On every screen: touch targets of at least 44 px, 16 px input text, safe-area padding for fixed bars, and no horizontal scrolling at 320 px.
