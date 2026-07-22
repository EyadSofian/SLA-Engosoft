# Dashboard override

This page keeps Engosoft's existing Arabic-first visual identity while following the master system's trust-and-authority direction.

## Typography

- Use `Cairo` for headings and body text so Arabic labels remain compact and legible.
- Fall back to `Tajawal`, `system-ui`, and `Segoe UI`.
- Use tabular numerals for tables and aligned metrics; keep large headline figures proportional.

## Brand tokens

- Primary navy: `#0B2545`
- Brand blue: `#1D6FB8`
- Accent orange: `#F5821F`
- Canvas: `#F6F8FB`
- Card: `#FFFFFF`
- Border: `#E6ECF3`
- Status colors stay reserved for OK, warning, and failure states.

## Mobile information hierarchy

- Show four primary KPIs in a 2×2 grid.
- Put secondary metrics in one compact strip or an expandable details card.
- Use a horizontal, scrollbar-free shortcut row for long dashboard sections.
- Render employee performance as compact cards below `1024px`; keep the full table for desktop.
- Show the first 12 employee cards initially, with a 48px touch target to reveal the full list.
- Keep every interactive target at least 44px high and preserve bottom safe-area clearance.
- Floating utilities should attach to the screen edge so they obscure as little data as possible.

## Motion

- Use subtle two-pixel lift and spring press feedback on metric cards.
- Respect `prefers-reduced-motion` through the application-level motion configuration.
- Never animate height for core dashboard content.
