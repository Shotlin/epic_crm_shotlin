# /settings/pincode-mapping

## Reference evidence

- **Pinned Bakaloo source:** `src/app/(dashboard)/settings/pincode-mapping/page.tsx`
- **Live recording coverage:** No
- **Reference family:** Settings form
- **Target Epic destination:** Setup / controlled configuration
- **Required scope:** Role controlled

## Visual contract

Use the shared fixed 260 px / collapsed 72 px sidebar, 64 px sticky header, white surfaces, calm neutral borders, Bakaloo green selected navigation, Lucide icons, and one vertical workspace scroll owner. Preserve the reference route's information hierarchy and table/chart placement when this route is implemented.

## Data and governance contract

Bind all values to governed Epic projections. Show loading, empty, permission-denied, unconfigured and error states distinctly; unknown is never rendered as zero. Mutations require Epic maker/checker, audit evidence, tenant/shop isolation and idempotency where applicable.

## Acceptance checklist

- [ ] Exact route and visual hierarchy implemented
- [ ] Real governed projection connected
- [ ] Loading, empty, error and permission states verified
- [ ] HQ/store scope and role policy verified
- [ ] Keyboard, focus, contrast and responsive review passed
- [ ] Visual comparison recorded at 1366×768, 1440×900 and 1600×1000
- [ ] Focused interaction/E2E test passed
