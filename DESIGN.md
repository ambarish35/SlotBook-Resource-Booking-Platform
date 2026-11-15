# SlotBook — Design

> **Status: partly built.** This is the design spec for the MVP in [PLAN.md](PLAN.md). Built so far: the tokens, the app shell, sign in and register (M0–M1), resource discovery and the resource detail header (M2), Manage resources (M3), the date picker, slot grid, selection summary, confirmation and conflict handling on a resource's page (M5, on the M4 booking API), and My bookings with cancellation and the admin All members view (§5.7, M6). Everything in §5 is built.

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
- **Width:** 480 px for confirmations, 640 px for forms. Below 640 px (768 px for the discovery filters and the Manage resources form) a dialog becomes a full-width bottom sheet with radius `xl` on its top corners, at most 90% of the viewport height, a scrolling body and a sticky footer. A form fills the whole screen instead, with square corners (§5.8).
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
- **Fitting at 768 px:** a table with many columns (Manage resources has seven) uses tighter cell padding at 768–1023 px and stacks its row actions, so it fits without scrolling. The card around it scrolls sideways only as a last resort, for text with no spaces, and it contains the screen-reader-only text so that never widens the page.
- The MVP has no sorting or pagination. Upcoming lists show the soonest first and history the newest first, limited to the latest 50 rows with the note "Showing the latest 50".

### Messages (section messages)

- Persistent inline messages at the top of the region they relate to: an icon, a title (`label-14` semibold), one or two sentences, and an optional action.
- The variants are info, success, warning and danger. Each has its own icon shape (circle-i, check, triangle, octagon), so color isn't the only cue.
- **Writing:** the title names the situation. The description says what happened and what to do next, so there are no dead ends. When the system is at fault, say so ("We couldn't load…").
- **Persistence:** success messages can be dismissed, with a "Dismiss message" icon button; the message then goes and focus moves to the page heading. Errors and warnings stay until the problem is resolved.
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
- The first focusable element is a "Skip to main content" link. It belongs to the app shell, so it is on every signed-in page; the sign-in and register pages have no repeated navigation to skip and no link.
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
- **Grid:** 3 columns at ≥ 1024 px with the filters in a 240 px left column; 2 columns at 768–1023 px with the filters in a row above the results; 1 column below that. Those counts are caps: a column is also at least 16 rem wide (14 rem from 1024 px), so when the reader's text size is larger there are fewer, wider columns and the cards are never squeezed (the pixel breakpoints don't know about the text size). At the default text size nothing changes.
- **Order:** rooms first, then equipment, each alphabetical.
- **Mobile:** a full-width search field and a "Filters" button showing the count of active filters. The button opens a bottom sheet with the same controls plus "Show 9 results" and "Clear filters".
- **States:**
  - Loading: skeleton cards.
  - Empty catalog: "No resources yet", followed for members by "An admin needs to add rooms or equipment." and for admins by an "Add resource" action.
  - No results: "No resources match your filters" with "Clear filters".
  - Error: "We couldn't load resources" with "Try again".
- **Settled while building M2:**
  - The page `h1` is "Find a resource"; the nav link is "Resources".
  - The search field is labelled "Search resources" with the caption "By name, location or tag". Every word typed must appear, ignoring case, in the name, location or a tag. Its clear button shows only while there is text.
  - Minimum capacity offers Any, then 2, 4, 6, 8, 12 and 20 "or more". It applies to rooms only, because equipment has no capacity: with Type set to All, choosing a capacity hides equipment, and a caption says so. Choosing Equipment clears the capacity.
  - "Clear filters" resets the type and capacity and also clears the search text, so it restores the full list.
  - The "Filters" button's count covers only the type and capacity, not the search text. Below 768 px the filters open as a bottom sheet (the generic dialog does so below 640 px).
  - An empty catalog shows only its empty state, with no search or filters. For an admin its "Add resource" action links to Manage resources, where the resource is added (§5.8).
  - Focus: from the no-results state, "Clear filters" moves focus to the search field. After "Try again" succeeds, focus moves to the search field; if it fails again, focus moves to the error message.

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
- **Built in M2 (header only):** the back link, the name with its type tag, the location and seats, the tags and the description. Until M5 built the date picker and slot grid, an info message said "Booking isn't available yet" instead of showing a placeholder grid; M5 replaced it with the booking flow below. An admin who opens an inactive resource sees an "Inactive" lozenge. The page header stays on screen while the resource loads or fails, so focus placed on the `h1` after navigation survives. "Try again" moves focus to the `h1` on success, or to the message on failure.
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
- **Other failures:** the dialog stays open with a danger message, and the buttons become active again. What the message may say depends on how definite the answer was. "Nothing was booked" is written only when the server has definitely refused the request (a 4xx).
  - **No answer, or a server error (5xx):** the outcome is unknown, because the server may have committed before the answer was lost or before it failed while building the reply. "We couldn't confirm your booking. We couldn't reach the server, so we can't tell if it went through. Check your connection and try again. If these times now show as Your booking, it did." (for a 5xx: "The server ran into a problem, so we can't tell if it went through…"). The grid is refreshed so that a booking that did go through shows as "Your booking".
  - **Any other 4xx:** "We couldn't complete your booking. Nothing was booked. Try again."
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

**Settled while building M5 (§5.4 to §5.6, §6 and §7):**

- **The address and the date.** The date is in the address, `/resources/:id?date=2026-11-14`, and no parameter means today. Moving to another date adds a history entry, so Back returns to the previous date, and the date survives signing in again (§5.5 Expired session). A date that isn't a real date, is before today or is beyond today + 30 is dropped from the address, and the page shows today. "Today" is the IST date on the client as well, never the browser's own zone.
- **The date control.** A visible label "Date" over the row. Previous day, Next day and Today are `aria-disabled`, never `disabled`, where they would do nothing (Previous day and Today on today, Next day on the last bookable day), and the caption "All times IST (UTC+05:30). You can book from today up to 30 days ahead." says why. "Changing the date clears your selection." sits under the row, in view at every width, while a selection exists, instead of inside the summary. A date typed or picked in the field loads as soon as it is complete and bookable. A complete date outside the window shows "Choose a date from Sun, 15 Nov to Tue, 15 Dec." once typing has paused for about 0.6 s, or when the field is left, never on every keystroke (typing a new month over 27 Nov passes through 27 Feb). It stays in the field, `aria-invalid`, with that message until another date is chosen; the grid keeps showing the last good day. A half-typed date is put back when the field is left.
- **Where the summary sits.** The sticky panel is the right column from 1024 px. Below that, tablets included, it is the sticky bottom bar (§5.4 names only phones); the confirmation is a bottom sheet below 768 px. The bar is hidden with nothing selected. It reads "3 slots · 10:00–11:00 IST", then "+1 more" when there are more ranges (the dialog lists them all), and carries the 8-slot message. The page adds bottom padding while the bar shows, so it never covers a slot.
- **One live region.** A visually hidden `role="status"` in the page reports "2 slots selected", "No times selected" or "You can book up to 8 slots at a time." for the panel and the bar together, so it is read once. The limit message is also shown as visible text in the panel or bar, which is not live. The live text is a new element each time the limit is hit, so a repeated refusal is read again.
- **Slots.** The visible text is the time, with a word beneath it for every state except Available. Accessible names read "10:00 to 10:30 IST", with ", booked", ", your booking", ", just taken" or ", past" added; a selected slot adds nothing, because `aria-pressed` says it. A slot that isn't Available is never drawn Selected, even if it is still in the selection. The legend lists "Just taken" only while a slot is drawn that way. The one Tab stop remembers where focus was last. Up and Down move by the number of columns as drawn (8 from 1024 px, 4 below) and stop at the ends, as Left and Right do.
- **Remove and Clear.** Remove takes out the whole range. Focus then goes to the next Remove button, or to the grid when none is left; "Clear selection" focuses the grid.
- **The day's states.** Loading: three groups of skeleton cells, with the date control still usable. Error: "We couldn't load the times" with "Try again", focus on the first slot after a success and on the message after another failure. No free time (every slot booked or started, today after 19:30 included): the empty state "No free times on Sat, 14 Nov" with "Next day", which has no action on the last bookable day. When some of those slots are the caller's own, the grid stays, under an info message "No free times left on Sat, 14 Nov". An admin opening an inactive resource sees a warning "This resource is inactive" with a "Manage resources" link, and no date control or grid, because the API refuses to book it for everyone.
- **The confirmation.** "Confirm booking" lists Resource (name, then "Room · Block A, 2nd floor"), Date, Time or Times (each range with its slot count), Total ("1 h · 2 slots") and "All times IST (UTC+05:30).". Focus starts on the title.
- **Success.** The message title is "Booking confirmed · Room A · Sat, 14 Nov 2026 · 10:00–11:00 IST", with several ranges separated by commas, then "The times now show as Your booking.", a "View my bookings" link and Dismiss. Focus moves to it. The booking response is the authority: the grid marks those slots "Your booking" from it at once, then fetches a fresh grid in the background, and a failed background fetch isn't shown as an error. The message stays when the date changes, until dismissed or replaced. The link opens My bookings on Upcoming (§5.7), where the new booking is listed.
- **Other failures, in the dialog.** No answer from the server: "We couldn't confirm your booking", "We couldn't reach the server, so we can't tell if it went through…", because "Nothing was booked" could be false when the answer was lost after the server committed; the grid is refreshed so a booking that did go through shows as "Your booking". A server error (5xx) is treated the same way as no answer ("The server ran into a problem, so we can't tell if it went through…"), because the server can fail after it has committed; only a definite refusal says "Nothing was booked". Any other 4xx: "We couldn't complete your booking", "Nothing was booked. Try again." A 400: the server's message, then "Nothing was booked. Go back and choose again." A 404 (the resource was deactivated meanwhile): the dialog closes and the page loads the resource again. A 401 goes to sign in and back to the same resource and date; the selection is not kept.
- **Conflicts, exactly.** The selected slots that are dropped are the ones the refusal named plus any the refreshed grid no longer offers; every other selection stays. "Just taken" marks the slots reported booked that the refreshed grid shows as held by someone else (one freed again meanwhile is simply Available, and a started one is Past). A slot the refreshed grid shows as the caller's own is described as "already your booking", not as booked by someone else. Booked and started slots can both appear in the message. The warning and "Just taken" disappear when the selection changes, and with the date: leaving a date and coming back does not bring them or the selection back. While the day is being refreshed the grid is `aria-busy`, slot presses are ignored and the Review button reads "Updating times…". If the refresh fails, the danger message "We couldn't refresh the times" says nothing was booked and that the selections are unchanged, and "Try again" repeats the refresh and then the same handling.

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

**Settled while building M6 (§4 Tables and Badges, §5.7):**

- **The address.** `/bookings` is Upcoming and Mine. `?view=history` and `?scope=all` (admins only) are the other choices, and the view links change only these parameters, each keeping the other: `?scope=all&view=history` is everyone's history. Both can be bookmarked and survive signing in again. A value the page can't honour (a mistyped view, or `scope=all` for a member) is dropped from the address and the page shows Upcoming and Mine. For a member the page never asks for the admin list; the API refuses it with 403 anyway.
- **Two view switches.** Admins get "Mine / All members" above "Upcoming / History", both the §4 view switch. The `h1` stays "My bookings" in every view. A count line (`role="status"`, "3 bookings") sits under the switches, and says "Showing the latest 50" when the API returned 50 rows (for Upcoming these are the 50 soonest).
- **Rows.**
  - Resource (name, then the type tag), Date ("Sat, 14 Nov 2026"), Time (IST) with each run of consecutive slots on its own line (a booking can hold 09:00 and 14:00), Duration (the total, "1 h 30 min"), Status, "Booked by" (name, then email) in All members, and Actions. A time range never breaks across lines. The date may wrap at 768 px, where the seven columns of All members have to fit without scrolling.
  - Status: Confirmed (a booking that hasn't started), In progress, Completed (it has ended and is still on screen, then leaves Upcoming) and Cancelled. A row has "Cancel" only while it hasn't started; other rows show "—" with "No actions" for screen readers.
  - The visible "Cancel" is followed by screen-reader-only " booking: Room A, Sat 14 Nov, 10:00–11:00 IST". On a phone the same button is the full-width "Cancel booking" and the text after it is ": Room A, …".
- **The clock.** "In progress" and "Completed" come from the browser's clock, compared the way the API lists bookings (`start <= now < end`). The page reads the clock again when a booking on screen starts or ends, when the list is replaced, when the tab becomes visible again and at least once a minute, so a booking that begins while the page is open loses its Cancel button at that moment, without a request, and an upcoming booking that ends makes the page fetch the list again so the server moves it to History. The API still has the last word: a Cancel on a row that has just started is a 409. A browser clock that disagrees with the server's moves these labels by the difference, and nothing else.
- **The dialog.** "Cancel this booking?" (a bottom sheet below 768 px, like the booking dialog). Focus starts on the title. The body is Resource (name, then type and place), Date, Time or Times (each range with its slot count), Total, "Booked by" in All members, "Its time slots will become available to others." and "All times IST (UTC+05:30).". While the request runs the button reads "Cancelling…", Close, Esc, the backdrop and "Keep booking" do nothing, and a second press sends nothing.
- **What the dialog says depends on how definite the answer is** (the same rule as §5.5: "nothing was cancelled" is written only for a definite refusal):
  - **409 `BOOKING_NOT_CANCELLABLE`** (already cancelled, or already started): a warning "This booking can't be cancelled" with the server's reason and "We refreshed your bookings.". The list is fetched again first, so that sentence is true; if that fails it says "We couldn't refresh your bookings, so reload the page to see their current state." Only "Close" is left. Focus is on the message, and on closing it goes to the heading, because the button that opened the dialog is gone.
  - **404** (not the caller's booking, or no such booking): a warning "We couldn't find this booking" with the likely reason and the same refresh sentence. Only "Close".
  - **Any other 4xx:** a danger message "We couldn't cancel this booking": "The server didn't accept the request, so the booking was not cancelled. Try again, or reload the page." "Close" and "Cancel booking".
  - **No answer, or a 5xx:** a danger message "We couldn't confirm the cancellation": "We couldn't reach the server, so we can't tell whether this booking was cancelled. Refresh to see its current state. If it is still listed, you can try again." (for a 5xx, "The server ran into a problem, so…"). It never says the booking was, or was not, cancelled. The message has "Refresh bookings", and the footer "Close" and "Cancel booking" (trying again is safe: if the first request did go through, the second is a plain 409). A refresh that finds the booking still upcoming says "It's still booked" and that nothing was changed. One that finds it started shows the 409 explanation. One that finds it gone closes the dialog and shows an info message above the list, "Room A · Sat, 14 Nov · 10:00–11:00 IST is no longer under Upcoming", "It was cancelled or it has ended. History shows which.", with "Open History". If the refresh fails too, the dialog says so and "Refresh bookings" stays.
- **Success.** The dialog closes, the row leaves Upcoming at once (the server confirmed it) and the list is fetched again in the background (a failed refresh isn't shown as an error). The message is "Booking cancelled · Room A · Sat, 14 Nov · 10:00–11:00 IST", with "Its time slots are available to others again." For an admin who cancelled someone else's booking: "Asha Member will see it as Cancelled, and its time slots are available to others again." (not for a removed account, which the API lists as "Deleted account"). It has "Open History" and Dismiss, takes focus, and stays when the view changes, until dismissed or replaced. Dismiss puts focus on the heading.
- **States.** Loading: skeleton rows (a table shape from 768 px, cards below) with "Loading bookings…" for screen readers; the switches stay usable, and the list of another view is never drawn under the wrong label while one loads, nor replaced by a slow answer for a view the user has left. Empty: Upcoming "No upcoming bookings" with "Find a resource" (Mine) or "Nobody has an upcoming booking right now." (All members, no action); History "No past or cancelled bookings yet". Error: "We couldn't load your bookings" ("We couldn't load all bookings" in All members) with "Try again", focus on the message after a failed retry and on the heading after a good one.
- **Bookings of a deactivated resource** stay in every list and can be cancelled (§5.8's deactivate dialog sends admins here).

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
- **Settled while building M3:**
  - **List and views.** The page loads every resource with `GET /api/resources?status=all`. The status links are real links (`?status=active`, `?status=inactive`, none for All), and with no parameter the view is **All**, so a deactivated row stays in place and turns Inactive, as "the row updates" says. Search covers the name and the location (not tags). Type is a select (All types, Rooms, Equipment). A count in a `role="status"` line reads "8 resources". "Clear filters" resets the search, the type and the status.
  - **Only one "Add resource".** It is in the page header once the list has loaded and has at least one resource. With no resources it is the empty state's action instead, and while loading or after an error there is none.
  - **Rows.** Each row's buttons read "Edit Room A", "Deactivate Room A" and "Reactivate Room A": the visible word first, then the name for screen readers. Equipment shows "—" for capacity, with "No capacity" for screen readers. Row actions are 32 px high on desktop; on mobile they are full-width 44 px buttons in the card.
  - **Form fields.** Name, Type (Room or Equipment radios, Room first), Location (caption "For example, Block A, 2nd floor"), Capacity (shown only for rooms: a text field with a numeric keypad, caption "Seats, a whole number of 1 or more"), "Description (optional)" and "Tags (optional)". Choosing Equipment hides Capacity, and the server stores none. Tags are split on commas, trimmed, and repeats (ignoring case) are dropped. Limits: name 80, location 120, description 500, 10 tags of 30 characters.
  - **Checking.** The form checks itself on submit, with every problem shown at once and focus on the first, and again on blur after the first try. The server checks too: a 400 puts each message on its field, a taken name (409) puts "A resource with this name already exists." on the Name field, and any other failure shows "We couldn't save this resource" inside the dialog with focus on it, saying nothing was added or changed.
  - **Edit sends only what changed.** Saving the Edit form sends just the fields that differ from the resource as it was when the dialog opened, so it can't undo another admin's edit of a field this admin left alone. With no change the dialog stays open and an info message, "No changes to save", takes focus.
  - **While saving.** The submit button reads "Adding…" or "Saving…". Close, Cancel, Esc and a click on the backdrop do nothing until the server answers, and a second submit is ignored. Reopening a dialog always starts fresh.
  - **After a result.** The dialog closes and a success message is focused at the top: "Room 204 added", "Changes to Room 204 saved", "Room 204 deactivated" or "Room 204 reactivated". When the current search, type or status would hide the changed row, the message says so and tells the admin to clear the filters. A failed reactivation shows a danger message there that stays until the next try.
  - **Deactivate.** The dialog opens with focus on its title, not on a button. "Keep active" closes it and focus returns to the "Deactivate" button that opened it. A failure appears inside the dialog.
  - **Breakpoint.** The table shows from 768 px, cards below. The form is a centered 640 px dialog from 768 px and a full-screen sheet below it (square corners, a sticky footer, the body scrolls), so it follows the page's own mobile breakpoint rather than the generic 640 px one.

## 6. Slot states

| State | Look | Visible text | Semantics | Interaction |
|---|---|---|---|---|
| Available | `surface`, 1 px `border-strong`; on hover `accent-subtle` with an `accent` border | "10:00" | `<button aria-pressed="false">` | Click, Space or Enter selects it |
| Selected | `accent` fill, white text, check icon | "10:00" and "Selected" | `aria-pressed="true"`; the word "Selected" is `aria-hidden` because the pressed state is already announced | The same keys deselect it |
| Unavailable | `surface-subtle`, no border, `fg-secondary` text | "10:00" and "Booked" | `aria-disabled="true"`; still focusable | None |
| Unavailable, yours | `accent-subtle`, `accent-hover` text | "10:00" and "Your booking" | `aria-disabled="true"` | None |
| Unavailable, just taken | `warning-subtle`, 1 px warning border, `warning` text | "10:00" and "Just taken" | `aria-disabled="true"` | None; becomes "Booked" at the next change |
| Past | No fill, 1 px dashed `border`, `fg-muted` text | "10:00" and "Past" | `aria-disabled="true"` | None |

- **Settled while building M4 (API):** the availability endpoint reports `status` as `available`, `unavailable` or `past`, and `mine` separately. A slot that has started is `past` even when it is booked, so a booked slot in the past arrives as `past` (with `mine: true` for its owner) and is drawn as Past. The "Unavailable" and "Unavailable, yours" rows above apply to slots that haven't started. "Just taken" is a client-only state (§5.6), never sent by the API.
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

**Settled while polishing (M7, §7 and §4):**

- **Zoom and text size are different tests.** Browser zoom to 200% halves the width in CSS pixels, so the breakpoints respond and the phone layouts appear. Doubling only the text size (the browser's font-size setting) leaves the breakpoints where they are, so the layout has to cope on its own. Zoom was checked on all 20 screens and states (including the dialogs) and the text size on the main ones (sign in, discovery, a resource's page with and without a selection, My bookings in both scopes, Manage resources) at 1280, 1024 and 768 px: no horizontal scrolling of the page, no clipped text, no text squeezed to a sliver.
- **What makes the text-size case work:** the resource grid's column counts are caps with a minimum width in `rem` (§5.3); the resource card's type tag wraps below its name instead of squeezing it; the top bar wraps, so the user's name and Sign out drop to a second line when the nav and the name don't fit; the wordmark link is 44 px high on a phone.
- **What doesn't:** with the text size doubled on a screen 768 to 1279 px wide, the tables (My bookings, Manage resources) keep their columns and scroll sideways inside their card, the last resort §4 allows, instead of turning into cards. Browser zoom to 200% does turn them into cards.
- **Focus rings.** Every Tab stop shows the global `accent` ring. A date field's focus sits on its day, month or year part and the field itself doesn't report `:focus-visible`, so it has the same ring through `:focus-within`.
- **Focus after sign-in.** Focus is on the page heading, as after any navigation; Tab continues from there, down the page. The header's links are reached with Shift+Tab, or from the start of the page after the skip link.
- **Motion.** None except the spinner, which animates only under `prefers-reduced-motion: no-preference`; there are no CSS transitions anywhere. Under "reduce" nothing on screen animates, and a button that is working still shows its spinner icon, still with its text ("Booking…").
- **Page titles.** "Sign in", "Create an account", "Find a resource", the resource's name, "My bookings", "Manage resources", "You don't have access to this page", "Page not found" and "Resource not found", each followed by " · SlotBook". One `h1` per page and no skipped heading levels, checked on every screen.

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
