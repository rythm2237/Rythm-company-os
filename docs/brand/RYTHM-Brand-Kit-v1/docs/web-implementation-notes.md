# Web implementation notes

## Public and authenticated shells

- Use `vector/logo-navbar-primary.svg` on light navigation surfaces.
- Use `vector/logo-navbar-inverse.svg` on Authority Navy surfaces, including the fixed left sidebar.
- Use `icons/favicon.ico` as the legacy browser fallback and `icons/favicon.svg` for modern browsers.
- Use `icons/apple-touch-icon.png`, `icons/pwa-icon-192.png`, and `icons/pwa-icon-512.png` in application metadata.

## Recommended metadata

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

## Logo behavior

- Keep the artwork static; animate the surrounding UI state, not the logo geometry.
- For a subtle system-ready state, the Decision Cyan node may pulse once on initial application readiness. Respect `prefers-reduced-motion` and never loop continuously.
- Minimum navbar lockup width: 120 px.
- Minimum independent mark size: 20 px.
