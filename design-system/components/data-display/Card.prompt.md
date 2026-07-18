Data-display primitives — `Badge`, `Card`, `Avatar`.

```jsx
<Badge variant="success" dot>Acesso autorizado</Badge>
<Badge variant="danger" dot>Negado</Badge>

<Card eyebrow="Reconhecimento facial" title="Verificação concluída"
      footer={<Button size="sm" variant="ghost">Ver registro</Button>}>
  Identidade confirmada em 284ms com 99,2% de confiança.
</Card>

<Avatar name="Helena Braga" status="online" />
```

Badge variants: `neutral` `accent` `success` `warning` `danger` `solid` (+ `dot`, `square`). Card: `eyebrow`, `title`, `headerAction`, `footer`, `interactive`, `inverse`, `flat`. Avatar: `name`, `src`, `size`, `status`.
