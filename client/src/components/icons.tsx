import type { SVGProps } from 'react';

/** Inline icons (no icon pack, per PLAN.md D10). All are decorative: the words carry the meaning. */
function Icon({ children, size = 20, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

/** Info: a circle with an "i". */
export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10" cy="10" r="8" />
    <path d="M10 9v5" />
    <path d="M10 6.25h.01" />
  </Icon>
);

/** Success: a circle with a check. */
export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10" cy="10" r="8" />
    <path d="m6.5 10.25 2.25 2.25 4.75-5" />
  </Icon>
);

/** Warning: a triangle with an exclamation mark. */
export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 2.5 18 16.5H2L10 2.5Z" />
    <path d="M10 8v4" />
    <path d="M10 14.25h.01" />
  </Icon>
);

/** Error: an octagon with an exclamation mark. */
export const ErrorIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 2h6l5 5v6l-5 5H7l-5-5V7l5-5Z" />
    <path d="M10 6.5v4.25" />
    <path d="M10 13.25h.01" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 5.5h14M3 10h14M3 14.5h14" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Icon>
);

/** A bare check mark, for a selected slot (the circled CheckIcon belongs to success messages). */
export const TickIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 5-5 5 5 5" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m8 5 5 5-5 5" />
  </Icon>
);
