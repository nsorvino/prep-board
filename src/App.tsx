import { useEffect, useMemo, useState } from 'react';
import type { Dish, RowKey, ToggleState, Filter } from './types';
import { Table } from './components/Table';
import { Legend } from './components/Legend';
import { fetchAll, insertDish, insertItem } from './db';

const makeKey = (rk: RowKey) => `${rk.dishId}:${rk.itemIdx}`;

const LS = {
  toggles: 'pl_toggles',
  notes: 'pl_notes',
  stars: 'pl_stars',
  compact: 'pl_compact',
  collapsed: 'pl_collapsed',
};

export default function App() {
  const [compactMode, setCompactMode] = useState<boolean>(
    () => localStorage.getItem(LS.compact) === '1',
  );

  // Dishes in the UI shape the Table expects (items are strings)
  const [dishes, setDishes] = useState<Dish[]>([]);

  // Per-device UI state
  const [toggles] = useState<Record<string, ToggleState>>({});
  const [notes] = useState<Record<string, string>>({});
  const [stars] = useState<Record<string, boolean>>({});
  const [collapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS.collapsed) || '{}');
    } catch {
      return {};
    }
  });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Compact mode body class
  useEffect(() => {
    document.body.classList.toggle('compact', compactMode);
  }, [compactMode]);

  // Persist compact + collapsed
  useEffect(() => {
    localStorage.setItem(LS.compact, compactMode ? '1' : '0');
    localStorage.setItem(LS.collapsed, JSON.stringify(collapsed));
  }, [compactMode, collapsed]);

  // Load data from Supabase (via db.ts)
  useEffect(() => {
    (async () => {
      const { dishes: dishRows, items: itemRows /* states unused for now */ } = await fetchAll();

      // Build Dish[] with string items
      const byDish: Record<string, Dish> = {};
      for (const d of dishRows) {
        byDish[d.id] = { id: d.id, name: d.name, items: [] };
      }
      for (const it of itemRows) {
        const bucket = byDish[it.dish_id]; // narrow
        if (bucket) {
          bucket.items.push(it.name);
        }
      }
      setDishes(Object.values(byDish));

      // Note: itemRows already ordered by position in fetchAll()
      setDishes(Object.values(byDish));
    })();
  }, []);

  // Add Dish → insert via db.ts then update local Dish[]
  const addDish = async () => {
    const name = prompt('Dish name?');
    if (!name) return;
    try {
      const row = await insertDish(name);
      setDishes((prev) => [...prev, { id: row.id, name: row.name, items: [] }]);
    } catch (e) {
      console.error(e);
      alert('Failed to add dish.');
    }
  };

  // Add Item → insert via db.ts (position = current length) then update local Dish[]
  const addItem = async (dishId: string) => {
    const txt = prompt('Add item');
    if (!txt) return;
    try {
      // Compute next position based on current UI list for that dish
      const current = dishes.find((d) => d.id === dishId);
      const nextPos = current ? current.items.length : 0;
      await insertItem(dishId, txt, nextPos);
      setDishes((prev) =>
        prev.map((d) => (d.id === dishId ? { ...d, items: [...d.items, txt] } : d)),
      );
    } catch (e) {
      console.error(e);
      alert('Failed to add item.');
    }
  };

  // Search/filter → produce visible view for rendering
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pass = (dish: Dish, item: string, idx: number) => {
      const key = makeKey({ dishId: dish.id, itemIdx: idx });
      if (filter === 'starred' && !stars[key]) return false;
      if (filter === 'on' && (toggles[key] ?? '') !== 'on') return false;
      if (filter === 'prep' && (toggles[key] ?? '') !== 'prep') return false;
      if (!q) return true;
      return (
        dish.name.toLowerCase().includes(q) ||
        item.toLowerCase().includes(q) ||
        (notes[key] ?? '').toLowerCase().includes(q)
      );
    };
    return dishes.map((dish) => ({
      dish,
      items: dish.items
        .map((it, idx) => ({ it, idx }))
        .filter(({ it, idx }) => pass(dish, it, idx)),
    }));
  }, [dishes, query, filter, stars, toggles, notes]);

  return (
    <div>
      <div className="bar" role="toolbar" aria-label="Controls">
        <button onClick={() => setCompactMode((v) => !v)}>
          {compactMode ? 'Normal size' : 'Compact'}
        </button>
        <button onClick={addDish}>Add Dish</button>
        <input
          type="text"
          placeholder="Search dish, item, or note…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">All</option>
          <option value="starred">Starred</option>
          <option value="on">On</option>
          <option value="prep">Prep</option>
        </select>
      </div>

      <Legend />

      {/* If you later lift row-state to App, pass the handlers here instead. */}
      <Table
        dishes={visible.map((v) => ({
          id: v.dish.id,
          name: v.dish.name,
          items: v.items.map((x) => x.it),
        }))}
        onAddItem={addItem}
      />
    </div>
  );
}
