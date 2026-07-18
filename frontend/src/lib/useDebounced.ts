"use client";

import { useEffect, useState } from "react";

/** Devolve o valor após `delay` ms sem mudanças — para buscas por digitação. */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
