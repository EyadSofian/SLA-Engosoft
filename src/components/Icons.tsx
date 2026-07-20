import type { SVGProps } from 'react';

/**
 * One icon family, one style: 24px grid, 1.75 stroke, round caps/joins.
 * Icons are never emoji — emoji render inconsistently across platforms and
 * carry the wrong tone in a management dashboard.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
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

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.5" />
  </Svg>
);

export const IconDepartments = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M5 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15" />
    <path d="M13 21V11a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10" />
    <path d="M8 9h2M8 13h2M8 17h2M16 14h.01M16 17h.01" />
  </Svg>
);

export const IconSales = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17.5 9 11l4 3.5L21 6.5" />
    <path d="M21 11V6.5h-4.5" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5a8 8 0 1 0-2.3 6" />
    <path d="M20 20v-5h-5" />
  </Svg>
);

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12Z" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 4 3.5 11.2a.5.5 0 0 0 .05.93L10 14l2 6.4a.5.5 0 0 0 .93.06L20 4Z" />
    <path d="M20 4l-10 10" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5 2.8 20a.6.6 0 0 0 .52.9h17.36a.6.6 0 0 0 .52-.9L12 4.5Z" />
    <path d="M12 10v4.5M12 18h.01" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconInbox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
    <path d="M5.6 5.5h12.8a1 1 0 0 1 .95.68l2.15 6.4V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18v-5.42l2.15-6.4a1 1 0 0 1 .95-.68Z" />
  </Svg>
);

export const IconUrgent = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const IconUserOff = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M4.5 20a7.5 7.5 0 0 1 12.2-5.85" />
    <path d="m16.5 17.5 5 5M21.5 17.5l-5 5" />
  </Svg>
);

export const IconTarget = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 3.5h-2A2.5 2.5 0 0 0 3 6.2c.5 8 6.8 14.3 14.8 14.8a2.5 2.5 0 0 0 2.7-2.5v-2a1 1 0 0 0-.8-1l-3.2-.65a1 1 0 0 0-1 .4l-1 1.35a13.5 13.5 0 0 1-5.6-5.6l1.35-1a1 1 0 0 0 .4-1L9.5 4.3a1 1 0 0 0-1-.8Z" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const IconEmpty = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" />
    <path d="M3.5 10.5h17M8.5 15h7" />
  </Svg>
);

export const IconSort = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4.5v15M8 19.5 4.5 16M8 19.5 11.5 16" />
    <path d="M16 19.5v-15M16 4.5 12.5 8M16 4.5 19.5 8" />
  </Svg>
);
