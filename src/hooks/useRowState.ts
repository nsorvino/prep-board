import { useState } from 'react';
import type { RowKey, ToggleState } from '../types';
const makeKey = (rk: RowKey) => `${rk.dishId}:${rk.itemIdx}`;
export function useRowState() {
  const [toggles, setToggles] = useState<Record<string, ToggleState>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [stars, setStars] = useState<Record<string, boolean>>({});
  const cycle = (s: ToggleState): ToggleState => (s === '' ? 'on' : s === 'on' ? 'prep' : '');
  return {
    toggles,
    notes,
    stars,
    toggleCell: (rk: RowKey) => {
      const k = makeKey(rk);
      setToggles((p) => ({ ...p, [k]: cycle(p[k] ?? '') }));
    },
    setNote: (rk: RowKey, v: string) => {
      const k = makeKey(rk);
      setNotes((p) => ({ ...p, [k]: v }));
    },
    flipStar: (rk: RowKey) => {
      const k = makeKey(rk);
      setStars((p) => ({ ...p, [k]: !p[k] }));
    },
    keyFor: makeKey,
  };
}
