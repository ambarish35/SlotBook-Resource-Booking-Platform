import type { ComponentPropsWithRef, ReactNode } from 'react';
import { CheckIcon, ErrorIcon, InfoIcon, WarningIcon } from './icons';

export type MessageVariant = 'info' | 'success' | 'warning' | 'danger';

/** Each variant has its own icon shape (circle-i, check, triangle, octagon), so color is never the only cue. */
const variants: Record<MessageVariant, { box: string; icon: string; Icon: typeof InfoIcon }> = {
  info: { box: 'border-info-border bg-accent-subtle', icon: 'text-accent-hover', Icon: InfoIcon },
  success: { box: 'border-success-border bg-success-subtle', icon: 'text-success', Icon: CheckIcon },
  warning: { box: 'border-warning-border bg-warning-subtle', icon: 'text-warning', Icon: WarningIcon },
  danger: { box: 'border-danger-border bg-danger-subtle', icon: 'text-danger', Icon: ErrorIcon },
};

type MessageProps = Omit<ComponentPropsWithRef<'div'>, 'title' | 'className'> & {
  variant: MessageVariant;
  /** Names the situation. */
  title: string;
  /** What happened and what to do next. */
  children?: ReactNode;
  action?: ReactNode;
};

/**
 * A persistent inline section message (DESIGN.md §4). It is focusable (tabIndex -1) so that, after
 * the user's own action, focus can move to it. Pass role="alert" for a failed page load.
 */
export function Message({ variant, title, children, action, ...props }: MessageProps) {
  const { box, icon, Icon } = variants[variant];
  return (
    <div tabIndex={-1} className={`flex gap-3 rounded-lg border p-4 ${box}`} {...props}>
      <Icon className={`mt-0.5 shrink-0 ${icon}`} />
      <div className="min-w-0 flex-1">
        <p className="text-label-14 font-semibold text-fg">{title}</p>
        {children ? <div className="mt-1 text-copy-14 text-fg">{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
