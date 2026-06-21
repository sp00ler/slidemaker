# Slidemaker — Design System Tokens
**Base:** Stripe (od://design-systems/stripe/DESIGN.md)
**Rationale:** Weight-300 sohne-var headlines = confident premium, not generic bold. `#533afd` violet ≠ slate+indigo default — reads "payment/trust". Blue-tinted shadows `rgba(50,50,93,0.25)` add depth without toy feel. Dark brand section `#1c1e54` gives hero real gravity. Conservative 4–8px radius = trust, not playful. Stripe is the gold standard conversion UI in paid SaaS.

---

## Color Tokens → `app/globals.css :root`

```css
/* Primary */
--c-primary:      #533afd;   /* Stripe Purple CTA */
--c-primary-h:    #4434d4;   /* Hover */
--c-primary-lite: #d6d9fc;   /* Soft border / ring fill */

/* Text */
--c-heading:      #061b31;   /* Deep navy — all h1-h4, card titles */
--c-text:         #273951;   /* Label / body-dark */
--c-text-2:       #64748d;   /* Body copy, list items */
--c-text-3:       #94a3b8;   /* Placeholder, hint, muted */

/* Backgrounds */
--c-bg:           #f8fafc;   /* Page background (slight blue-white) */
--c-white:        #ffffff;   /* Cards, inputs */
--c-dark-brand:   #1c1e54;   /* Hero + footer */

/* Borders */
--c-border:       #e5edf5;   /* All default borders */

/* Semantic */
--c-amber:        #d97706;   /* Author tariff accent (unchanged) */
--c-amber-h:      #b45309;
--c-amber-lite:   #fef3c7;
--c-amber-text:   #92400e;
--c-success:      #15be53;
--c-success-lite: rgba(21,190,83,0.12);
--c-error:        #dc2626;
--c-error-lite:   #fef2f2;

/* Radius */
--r-card:   6px;   /* Cards (was 16px) */
--r-input:  4px;   /* Inputs, buttons (was 8px) */
--r-btn:    4px;

/* Shadows */
--sh-sm:       rgba(23,23,23,0.06) 0px 3px 6px;
--sh-elevated: rgba(50,50,93,0.25) 0px 30px 45px -30px,
               rgba(0,0,0,0.1) 0px 18px 36px -18px;
--sh-ambient:  rgba(23,23,23,0.08) 0px 15px 35px 0px;
```

---

## Typography

**Font stack:** `'Inter', system-ui, -apple-system, sans-serif`
Add to `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
```

| Scale | size | weight | tracking | usage |
|-------|------|--------|----------|-------|
| Display | 48px | 300 | -0.96px | Hero h1 |
| Heading | 32px | 300 | -0.64px | Section h2 |
| Title | 20px | 300 | -0.26px | Card h3, modal h3 |
| Body | 16px | 400 | 0 | Default |
| Small | 14px | 400 | 0 | Feature lists, FAQ |
| Label | 13px | 500 | 0 | Form labels, badges |
| Caption | 12px | 400 | 0 | Hints, counters |
| Micro | 11px | 600 | +0.07em (uppercase) | Kicker badges |

**Stripe signature:** weight 300 for all headings. Use 400 only for body/buttons.

---

## Hero Section

```css
.hero {
  background: var(--c-dark-brand);   /* #1c1e54 — NOT animated gradient */
  padding: 64px 24px 56px;
}
/* Decorative radial glows (ruby + primary, not full gradient) */
.hero::before { background: radial-gradient(circle, rgba(234,34,97,0.18) 0%, transparent 70%); }
.hero::after  { background: radial-gradient(circle, rgba(83,58,253,0.22) 0%, transparent 65%); }
```

Layout: 2-col grid `1fr 280px` → single col on mobile.
Right col: slide mock (white card, aspect 16/9, `--sh-elevated`).

---

## Tariff Cards

```css
.tariff-card {
  background: var(--c-white);
  border: 1.5px solid var(--c-border);
  border-radius: var(--r-card);   /* 6px */
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
/* Standard ACTIVE state */
.tariff-card.standard.active {
  border-color: var(--c-primary);
  box-shadow: rgba(83,58,253,0.18) 0px 0px 0px 3px, var(--sh-elevated);
  transform: translateY(-3px);
}
/* Author card */
.tariff-card.author {
  background: #fffbeb;
  border-color: #fde68a;
}
.tariff-card.author.active {
  border-color: var(--c-amber);
  box-shadow: rgba(217,119,6,0.15) 0px 0px 0px 3px, var(--sh-elevated);
}
```

Price: `font-size: 30px; font-weight: 300; letter-spacing: -0.64px;`
Badge: `font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em;`

---

## Form Inputs

```css
input, textarea {
  border: 1px solid var(--c-border);
  border-radius: var(--r-input);   /* 4px */
  font-weight: 300;
  color: var(--c-heading);
}
input:focus, textarea:focus {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px rgba(83,58,253,0.10);
  outline: none;
}
```

---

## Buttons

```css
.btn {
  background: var(--c-primary);
  border-radius: var(--r-btn);   /* 4px */
  font-weight: 400;              /* not 600 — Stripe buttons are 400 */
  height: 50px;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}
.btn:hover {
  background: var(--c-primary-h);
  transform: translateY(-1px);
  box-shadow: rgba(83,58,253,0.30) 0px 8px 16px -4px;
}
```

---

## Animations

Keep all existing keyframes. Add:
```css
@keyframes fade-up {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
```

Hero elements stagger: badge → h1 → p → CTA at 0.08s / 0.16s / 0.24s / 0.32s delays.
Slide mock enters at 0.4s.
Chart bars inside mock rise sequentially.

---

## Uploader Slot States

| State | border | background | note |
|-------|--------|------------|------|
| empty | `--c-border` dashed | `--c-white` | default |
| drag-over | `--c-primary` solid | — | + `box-shadow: 0 0 0 3px rgba(83,58,253,0.12)` |
| loading | `--c-primary-lite` solid | — | spinner |
| ready | `rgba(21,190,83,0.30)` solid | — | checkmark |
| text-only | same as ready | — | no image |
| error-size | `--c-error` solid | `--c-error-lite` | |
| error-type | `--c-error` solid | `--c-error-lite` | |

---

## Dark Brand Section (Hero + Footer)

Both use `background: var(--c-dark-brand)` (`#1c1e54`). NOT black. Echoes Stripe's deep sections.

Footer: text at `rgba(255,255,255,0.50)` for links, `rgba(255,255,255,0.35)` for copyright.

---

## Scroll Reveal

```css
.reveal { opacity: 0; transform: translateY(22px); transition: opacity 0.55s, transform 0.55s; }
.reveal.visible { opacity: 1; transform: none; }
```

IntersectionObserver threshold 0.12, unobserve after first trigger.

---

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
  .reveal, .reveal-stagger > * { opacity: 1; transform: none; }
}
```

---

## Mobile Breakpoints

| Breakpoint | Changes |
|------------|---------|
| ≤640px | Hero 2-col → 1-col. Section h2 34→26px. Card padding -2px. |
| ≤480px | Navbar tagline hidden. Modal bottom sheet (border-radius top only). |

---

## Visual Reference

Full static HTML prototype: `design/stripe-redesign.html`
Open in browser to preview all states (hero, tariffs, form, uploader, modal).
