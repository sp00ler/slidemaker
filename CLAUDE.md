# CLAUDE.md - Slidemaker Context

## Commands
* Build: `npm run build`
* Test: `npm test`
* Run: `npm run dev`

## Current Status
* Branch: `redesign/order-flow-visual` (staged, not committed)
* Work: V3 Studio Dark theme layout fully implemented in `app/globals.css`, `app/page.tsx`, and `app/layout.tsx`.
* Fixes:
  1. Hero layout grid and `.slide-mock` preview restored in JSX.
  2. All upload slots visible immediately (`visibleCount = slideCount`), sequential locking removed.
  3. Uploader slots list layout changed to grid (no height blow-up).
  4. Author modal removed, instructions placed inline in form.
  5. Mobile sticky CTA added at bottom.
  6. Inter font configured.
* Validation: `npm run build` and `npm test` (20 passes) are green.
