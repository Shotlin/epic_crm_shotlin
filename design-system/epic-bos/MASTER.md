# Epic BOS design system — premium retail operating shell

This is the durable UI contract for the Electron renderer. It is India-first,
blue-white, visual, and progressively disclosed so a new store employee can
understand the first screen without losing the controls an operator needs.

## Visual direction

**Style:** Premium Executive Dashboard / Minimal Swiss

Use calm white surfaces, navy ink, blue for navigation and trusted actions,
amber for attention, and orange only for a single high-value call to action.
Keep the installed `Sora Variable` heading and `IBM Plex Sans Variable` body
fonts so the desktop app is deterministic and works offline.

## Tokens

| Role | Value |
|---|---|
| Canvas | `#F4F7FB` |
| Surface | `#FFFFFF` |
| Muted surface | `#EEF3F9` |
| Ink | `#14213D` |
| Muted text | `#5B6B83` |
| Border | `#D8E1ED` |
| Primary | `#2563EB` |
| Primary hover | `#1D4ED8` |
| Attention | `#A66A05` |
| Destructive | `#C53F52` |

Use 4/8px spacing steps, 10/14/18px radii, and restrained shadows. Do not
use decorative gradients, graph-paper backgrounds, or unrelated module themes.

## Application pattern

- A persistent left rail stacks `Home`, `Sell`, `Stock`, `Deliver`,
  `Customers`, `Money`, `Insights`, and `Setup`.
- Each selected item reveals its submodules directly underneath it.
- `Advanced workspaces` discloses Command, CRM, Sales, Finance, Operations,
  People, Service, and Intelligence for authorised users.
- The main area has one vertical scroll owner. Tables may scroll horizontally
  only when their columns require it; pages must never nest scroll traps.
- Every page has one primary action, readable labels, visible focus, and clear
  loading, empty, error, and permission states.

## Charts and data

Charts are decision aids, not decoration. Use line charts for time, bars for
comparison, and donuts only for a small composition. Every chart must expose an
accessible label, a visible legend/value list, and a truthful empty state. Do
not invent USD, Northbank, or generic opportunity data in the retail shell.

## Component contract

- Buttons and form controls are at least 44px high and keyboard reachable.
- Use labelled Lucide SVG icons; never emoji or icon-only controls for primary
  work.
- Hover changes color/elevation without moving layout. Respect reduced motion.
- Preserve Indian formats: INR, en-IN dates, GST terminology, and local
  outlet/branch language.

## Delivery checklist

- [ ] 375, 768, 1024 and 1440px layouts checked
- [ ] No horizontal overflow in the app shell
- [ ] All navigation and submodule buttons have a destination
- [ ] Charts have labels, legends and empty states
- [ ] Role, loading, error and disabled states are visible
- [ ] Typecheck, tests, lint and packaged smoke checks pass
