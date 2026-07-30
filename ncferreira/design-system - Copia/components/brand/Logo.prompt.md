The Flauzino logo — heraldic eagle mark, alone or locked up with the wordmark. Color is inherited, so it adapts to navy, ink, or light surfaces.

```jsx
<Logo />                                   {/* horizontal lockup, navy */}
<Logo variant="mark" size={28} />          {/* just the eagle — app icon */}
<Logo variant="stacked" tagline="Software House" />
<Logo color="#fff" />                       {/* on a navy/ink panel */}
```

Variants: `mark` / `lockup` / `stacked`. Props: `size` (px, wordmark scales from it), `tagline`, `color`.
