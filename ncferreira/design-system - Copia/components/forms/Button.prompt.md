Flauzino's primary button — navy authority by default, with a single luminous `accent` variant reserved for the most important action on a view.

```jsx
<Button variant="accent" iconLeft={<SearchIcon />}>Iniciar verificação</Button>
<Button variant="secondary">Cancelar</Button>
<Button variant="ghost" size="sm">Ver detalhes</Button>
<Button variant="primary" loading>Processando</Button>
```

Variants: `primary` (navy), `accent` (blue — use sparingly), `secondary` (outline), `ghost`, `danger`. Sizes: `sm` / `md` / `lg`. Props: `block`, `loading`, `iconLeft`, `iconRight`, plus all native button attributes.
