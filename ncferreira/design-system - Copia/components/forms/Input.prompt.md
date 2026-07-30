Form controls — text input, checkbox and switch — all wired to the Flauzino token system with visible focus rings.

```jsx
<Input label="E-mail corporativo" placeholder="nome@flauzino.com.br" required />
<Input label="Senha" type="password" error="Credenciais inválidas." />
<Checkbox label="Manter sessão ativa" description="Apenas em dispositivos confiáveis" />
<Switch label="Alertas em tempo real" defaultChecked />
```

Input props: `label`, `hint`, `error`, `required`, `icon`. Checkbox props: `label`, `description`. Switch props: `label`. All forward native attributes (`value`, `onChange`, `disabled`, …).
