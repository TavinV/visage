---
name: flauzino-design
description: Use this skill to generate well-branded interfaces and assets for Flauzino, a Brazilian software house specialized in facial-recognition systems and mission-critical corporate platforms — either for production or throwaway prototypes/mocks/decks. Contains essential design guidelines, colors, type, fonts, the eagle brand mark, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation

- **Brand feel:** institutional, technically sophisticated, secure — never startup/experimental/gamer/hacker aesthetics. Deep navy + near-black + a single controlled blue accent. Poppins for type.
- **Brand mark:** `assets/flauzino-mark.svg` — client-supplied heraldic eagle, monochrome, `currentColor`-driven. Never redraw it.
- **Tokens:** `tokens/*.css`, imported by `styles.css`. Use the CSS custom properties, don't hardcode hex values.
- **Components:** `components/<group>/<Name>.jsx` + `.d.ts` + `.prompt.md` — Button, Input, Checkbox, Switch, Card, Badge, Avatar, Logo.
- **UI kit:** `ui_kits/sentinel/` — a full facial-recognition access-control console (login, dashboard, identities directory) built from the components above.

Full detail — content voice, visual foundations, iconography, caveats — is in `readme.md`.
