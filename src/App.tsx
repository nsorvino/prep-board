import { useEffect, useMemo, useState } from 'react';
import type { Dish } from './types';
import {
  fetchAll,
  insertDish,
  insertItem,
  updateItemRecipe,
  updateDish,
  deleteDish as deleteDishFromDb,
  updateItem,
  deleteItem,
  subscribeToChanges,
} from './db';
import { Legend } from './components/Legend';

// ---------- Local Storage keys ----------
const LS = {
  dishesCache: 'ipl-v2.2-dishes-cache',
  cells: 'ipl-v2.2-cells',
  rowHi: 'ipl-v2.2-rowhi',
  notes: 'ipl-v2.2-notes',
  view: 'ipl-v2.2-view',
  daily: 'ipl-v2.2-daily',
  compact: 'ipl-v2.2-compact',
  userRecipes: 'ipl-v2.2-user-recipes',
};

// Default (static) recipes you ship with the app (optional)
const RECIPE_MAP: Record<string, string> = {};

// Utility: scale recipe numbers
function scaleRecipe(text: string, factor: number) {
  if (!text) return text;
  return text.replace(
    /(\d+(?:\.\d+)?)(?=\s*(g|kg|ml|l|oz|cups?|cup|tbsp|tsp|quart|pint|lb|lbs))/gi,
    (_m, num) => {
      const scaled = parseFloat(num) * factor;
      return String(Math.round(scaled * 100) / 100);
    },
  );
}

type FilterKind = 'all' | 'dish' | 'highlighted';
type ViewState =
  | { mode: 'full'; filter: FilterKind; dishId?: string | null }
  | { mode: 'daily'; filter: FilterKind; dishId?: string | null };

type DailySel = { enabled: boolean; items: Record<string, true> };

const rowKey = (dishId: string, item: string) => `${dishId}|${item}`;

export default function App() {
  // ---------- Core data ----------
  const [dishes, setDishes] = useState<Dish[]>(() => {
    const c = localStorage.getItem(LS.dishesCache);
    return c ? (JSON.parse(c) as Dish[]) : [];
  });

  // ---------- Per-device state ----------
  const [cells, setCells] = useState<Record<string, boolean>>(() => {
    const c = localStorage.getItem(LS.cells);
    return c ? JSON.parse(c) : {};
  });
  const [rowHi, setRowHi] = useState<Record<string, boolean>>(() => {
    const c = localStorage.getItem(LS.rowHi);
    return c ? JSON.parse(c) : {};
  });
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const c = localStorage.getItem(LS.notes);
    return c ? JSON.parse(c) : {};
  });
  const [view, setView] = useState<ViewState>(() => {
    const c = localStorage.getItem(LS.view);
    return c ? (JSON.parse(c) as ViewState) : { mode: 'full', filter: 'all', dishId: null };
  });
  const [dailySel, setDailySel] = useState<DailySel>(() => {
    const c = localStorage.getItem(LS.daily);
    return c ? JSON.parse(c) : { enabled: false, items: {} };
  });
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    return localStorage.getItem(LS.compact) === '1';
  });

  // ---------- Recipes (user editable) ----------
  const [userRecipes, setUserRecipes] = useState<Record<string, string>>(() => {
    const c = localStorage.getItem(LS.userRecipes);
    return c ? JSON.parse(c) : {};
  });
  const [itemMeta, setItemMeta] = useState<Record<string, { id: string; recipe: string | null }>>(
    {},
  );
  const [recipeModal, setRecipeModal] = useState<{ dishId: string; item: string } | null>(null);
  const [editRecipe, setEditRecipe] = useState(false);
  const [draftRecipe, setDraftRecipe] = useState('');
  const [scale, setScale] = useState(1);
  const [notesModal, setNotesModal] = useState<{ dishId: string; item: string } | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [realtimeNotification, setRealtimeNotification] = useState<string | null>(null);

  // ---------- Edit dish modal ----------
  const [editModal, setEditModal] = useState<{
    dishId: string;
    draftName: string;
    draftItems: string[];
    addBuffer: string;
    bulkBuffer: string;
  } | null>(null);

  // ---------- Add dish / Daily picker modal ----------
  const [addModal, setAddModal] = useState<
    { name: string; comps: string[]; dailyPicker?: false } | { dailyPicker: true } | null
  >(null);

  // Effects: body class + LS persistence
  useEffect(() => {
    document.body.classList.toggle('compact', compactMode);
  }, [compactMode]);
  useEffect(() => localStorage.setItem(LS.compact, compactMode ? '1' : '0'), [compactMode]);
  useEffect(() => localStorage.setItem(LS.cells, JSON.stringify(cells)), [cells]);
  useEffect(() => localStorage.setItem(LS.rowHi, JSON.stringify(rowHi)), [rowHi]);
  useEffect(() => localStorage.setItem(LS.notes, JSON.stringify(notes)), [notes]);
  useEffect(() => localStorage.setItem(LS.view, JSON.stringify(view)), [view]);
  useEffect(() => localStorage.setItem(LS.daily, JSON.stringify(dailySel)), [dailySel]);
  useEffect(() => localStorage.setItem(LS.userRecipes, JSON.stringify(userRecipes)), [userRecipes]);

  // Load from Supabase once
  useEffect(() => {
    (async () => {
      try {
        const { dishes: dishRows, items: itemRows } = await fetchAll();
        const map: Record<string, Dish> = {};
        const meta: Record<string, { id: string; recipe: string | null }> = {};
        for (const d of dishRows) map[d.id] = { id: d.id, name: d.name, items: [] };
        for (const it of itemRows) {
          const bucket = map[it.dish_id];
          if (bucket) {
            bucket.items.push(it.name);
            const k = rowKey(it.dish_id, it.name);
            meta[k] = { id: it.id, recipe: it.recipe ?? null };
          }
        }
        const list = Object.values(map);
        setDishes(list);
        setItemMeta(meta);
        localStorage.setItem(LS.dishesCache, JSON.stringify(list));
      } catch (err) {
        console.error('Failed to load from Supabase', err);
      }
    })();
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    const unsubscribe = subscribeToChanges(
      // Handle dish changes
      (payload) => {
        console.log('Dish change:', payload);
        if (payload.eventType === 'INSERT') {
          const newDish = payload.new;
          setDishes((prev) => [...prev, { id: newDish.id, name: newDish.name, items: [] }]);
          setRealtimeNotification(`New dish "${newDish.name}" added`);
        } else if (payload.eventType === 'UPDATE') {
          const updatedDish = payload.new;
          setDishes((prev) =>
            prev.map((d) => (d.id === updatedDish.id ? { ...d, name: updatedDish.name } : d)),
          );
          setRealtimeNotification(`Dish "${updatedDish.name}" updated`);
        } else if (payload.eventType === 'DELETE') {
          const deletedDish = payload.old;
          setDishes((prev) => prev.filter((d) => d.id !== deletedDish.id));
          setRealtimeNotification(`Dish "${deletedDish.name}" deleted`);
        }
        setTimeout(() => setRealtimeNotification(null), 3000);
      },
      // Handle item changes
      (payload) => {
        console.log('Item change:', payload);
        if (payload.eventType === 'INSERT') {
          const newItem = payload.new;
          setDishes((prev) =>
            prev.map((d) =>
              d.id === newItem.dish_id
                ? { ...d, items: [...d.items, newItem.name] }
                : d,
            ),
          );
          const k = rowKey(newItem.dish_id, newItem.name);
          setItemMeta((prev) => ({
            ...prev,
            [k]: { id: newItem.id, recipe: newItem.recipe ?? null },
          }));
          setRealtimeNotification(`New item "${newItem.name}" added`);
        } else if (payload.eventType === 'UPDATE') {
          const updatedItem = payload.new;
          const oldItem = payload.old;
          // Update item name if changed
          if (oldItem.name !== updatedItem.name) {
            setDishes((prev) =>
              prev.map((d) =>
                d.id === updatedItem.dish_id
                  ? {
                      ...d,
                      items: d.items.map((item) =>
                        item === oldItem.name ? updatedItem.name : item,
                      ),
                    }
                  : d,
              ),
            );
            setRealtimeNotification(`Item "${oldItem.name}" renamed to "${updatedItem.name}"`);
          }
          // Update recipe
          const k = rowKey(updatedItem.dish_id, updatedItem.name);
          setItemMeta((prev) => ({
            ...prev,
            [k]: { id: updatedItem.id, recipe: updatedItem.recipe ?? null },
          }));
          if (oldItem.recipe !== updatedItem.recipe) {
            setRealtimeNotification(`Recipe for "${updatedItem.name}" updated`);
          }
        } else if (payload.eventType === 'DELETE') {
          const deletedItem = payload.old;
          setDishes((prev) =>
            prev.map((d) =>
              d.id === deletedItem.dish_id
                ? { ...d, items: d.items.filter((item) => item !== deletedItem.name) }
                : d,
            ),
          );
          const k = rowKey(deletedItem.dish_id, deletedItem.name);
          setItemMeta((prev) => {
            const newMeta = { ...prev };
            delete newMeta[k];
            return newMeta;
          });
          setRealtimeNotification(`Item "${deletedItem.name}" deleted`);
        }
        setTimeout(() => setRealtimeNotification(null), 3000);
      },
    );

    return unsubscribe;
  }, []);

  // Shared components set
  const sharedSet = useMemo(() => {
    const counts: Record<string, number> = {};
    dishes.forEach((d) => d.items.forEach((i) => (counts[i] = (counts[i] || 0) + 1)));
    return new Set(Object.keys(counts).filter((k) => (counts[k] ?? 0) > 1));
  }, [dishes]);

  // ------- Top bar actions -------
  const openAddDish = () => setAddModal({ name: '', comps: ['', '', '', ''] });

  const addDishField = () =>
    setAddModal((m) => {
      if (!m || 'dailyPicker' in m) return m;
      return { ...m, comps: [...(m.comps || []), ''] };
    });

  const removeDishField = (i: number) =>
    setAddModal((m) => {
      if (!m || 'dailyPicker' in m) return m;
      const a = (m.comps || []).slice();
      a.splice(i, 1);
      return { ...m, comps: a.length ? a : [''] };
    });

  const saveNewDish = async () => {
    if (!addModal || 'dailyPicker' in addModal) return;
    const name = (addModal.name || '').trim();
    const comps = (addModal.comps || []).map((s) => s.trim()).filter(Boolean);
    if (!name || !comps.length) {
      alert('Dish name and at least one component required.');
      return;
    }
    try {
      const drow = await insertDish(name);
      for (const [i, name] of comps.entries()) {
        await insertItem(drow.id, name, i);
      }
      const newDish: Dish = { id: drow.id, name, items: comps };
      setDishes((ds) => [...ds, newDish]);
      setAddModal(null);
    } catch (e) {
      console.error(e);
      alert('Failed to save dish.');
    }
  };

  const openDailyPicker = () => setAddModal({ dailyPicker: true });

  const saveDailySelection = () => {
    const boxes = document.querySelectorAll<HTMLInputElement>('.daily-pick');
    const sel: Record<string, true> = {};
    boxes.forEach((b) => {
      const key = b.dataset.key;
      if (b.checked && key) sel[key] = true;
    });
    setDailySel({ enabled: true, items: sel });
    setView((v) => ({ ...v, mode: 'daily' }));
    setAddModal(null);
  };

  // ------- Row handlers -------
  const toggleCell = (dishId: string, item: string, kind: 'on' | 'prep') => {
    const k = `${rowKey(dishId, item)}|${kind}`;
    setCells((s) => ({ ...s, [k]: !s[k] }));
  };
  const toggleRow = (dishId: string, item: string) => {
    const k = rowKey(dishId, item);
    setRowHi((s) => ({ ...s, [k]: !s[k] }));
  };
  const updateNote = (dishId: string, item: string, val: string) => {
    const k = rowKey(dishId, item);
    setNotes((n) => ({ ...n, [k]: val }));
  };

  const openNotes = (dishId: string, item: string) => {
    const k = rowKey(dishId, item);
    setNotesModal({ dishId, item });
    setDraftNote(notes[k] || '');
  };

  const saveNote = () => {
    if (!notesModal) return;
    updateNote(notesModal.dishId, notesModal.item, draftNote);
    setNotesModal(null);
  };

  // ------- Recipe modal -------
  const openRecipe = (dishId: string, item: string) => {
    setRecipeModal({ dishId, item });
    setEditRecipe(false);
    const k = rowKey(dishId, item);
    const dbRecipe = itemMeta[k]?.recipe ?? null;
    setDraftRecipe(dbRecipe ?? (userRecipes[item] || RECIPE_MAP[item] || ''));
    setScale(1);
  };
  const saveRecipe = async () => {
    if (!recipeModal) return;
    const k = rowKey(recipeModal.dishId, recipeModal.item);
    const meta = itemMeta[k];
    if (!meta) return;
    try {
      await updateItemRecipe(meta.id, draftRecipe);
      setItemMeta((m) => ({ ...m, [k]: { id: meta.id, recipe: draftRecipe } }));
      setEditRecipe(false);
    } catch (e) {
      console.error(e);
      alert('Failed to save recipe');
    }
  };

  // ------- Edit Dish modal -------
  const openDishEditor = (dishId: string) => {
    const d = dishes.find((x) => x.id === dishId);
    if (!d) return;
    setEditModal({
      dishId,
      draftName: d.name,
      draftItems: d.items.slice(),
      addBuffer: '',
      bulkBuffer: '',
    });
  };

  const removeItemAt = (idx: number) =>
    setEditModal((m) => {
      if (!m) return m;
      const a = m.draftItems.slice();
      a.splice(idx, 1);
      return { ...m, draftItems: a };
    });

  const moveItem = (idx: number, dir: number) =>
    setEditModal((m) => {
      if (!m) return m;
      const a = m.draftItems.slice();
      const j = idx + dir;
      if (j < 0 || j >= a.length) return m;
      const tmp = a[j]!;
      a[j] = a[idx]!;
      a[idx] = tmp;
      return { ...m, draftItems: a };
    });

  const addOneItem = () =>
    setEditModal((m) => {
      if (!m) return m;
      const buf = m.addBuffer.trim();
      if (!buf) return m;
      return { ...m, draftItems: [...m.draftItems, buf], addBuffer: '' };
    });

  const addBulk = () =>
    setEditModal((m) => {
      if (!m) return m;
      const lines = m.bulkBuffer
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!lines.length) return m;
      return { ...m, draftItems: [...m.draftItems, ...lines], bulkBuffer: '' };
    });

  const saveDishEditor = async () => {
    if (!editModal) return;
    const { dishId, draftName, draftItems } = editModal;

    try {
      // Update dish name if changed
      const originalDish = dishes.find((d) => d.id === dishId);
      if (originalDish && draftName.trim() !== originalDish.name) {
        await updateDish(dishId, draftName.trim());
      }

      // Handle item changes
      const originalItems = originalDish?.items || [];
      const newItems = draftItems.filter((x) => x.trim() !== '');

      // Delete removed items
      for (const item of originalItems) {
        if (!newItems.includes(item)) {
          const k = rowKey(dishId, item);
          const meta = itemMeta[k];
          if (meta) {
            await deleteItem(meta.id);
          }
        }
      }

      // Update existing items and add new ones
      for (let i = 0; i < newItems.length; i++) {
        const item = newItems[i]!;
        const k = rowKey(dishId, item);
        const meta = itemMeta[k];

        if (meta?.id) {
          // Update existing item position
          await updateItem(meta.id!, item, i);
        } else {
          // Add new item
          const newItemRow = await insertItem(dishId, item, i);
          setItemMeta((m) => ({ ...m, [k]: { id: newItemRow.id, recipe: null } }));
        }
      }

      // Update local state
      setDishes((ds) =>
        ds.map((d) =>
          d.id === dishId ? { ...d, name: draftName.trim() || d.name, items: newItems } : d,
        ),
      );
      setEditModal(null);
    } catch (e) {
      console.error(e);
      alert('Failed to save changes to database');
    }
  };

  const deleteDish = async () => {
    if (!editModal) return;
    if (!confirm('Delete this dish? This cannot be undone.')) return;
    const id = editModal.dishId;

    try {
      // Delete from Supabase first
      await deleteDishFromDb(id);

      // Clean up local state
      const toDeleteItems = dishes.find((d) => d.id === id)?.items || [];
      setDishes((ds) => ds.filter((d) => d.id !== id));
      setRowHi((s) => {
        const n = { ...s };
        toDeleteItems.forEach((it) => delete n[rowKey(id, it)]);
        return n;
      });
      setCells((s) => {
        const n = { ...s };
        Object.keys(n).forEach((k) => {
          if (k.startsWith(`${id}|`)) delete n[k];
        });
        return n;
      });
      setNotes((s) => {
        const n = { ...s };
        Object.keys(n).forEach((k) => {
          if (k.startsWith(`${id}|`)) delete n[k];
        });
        return n;
      });
      setDailySel((s) => {
        const n = { ...s };
        const items = { ...n.items };
        Object.keys(items).forEach((k) => {
          if (k.startsWith(`${id}|`)) delete items[k];
        });
        n.items = items;
        return n;
      });

      // Clean up itemMeta
      setItemMeta((m) => {
        const n = { ...m };
        Object.keys(n).forEach((k) => {
          if (k.startsWith(`${id}|`)) delete n[k];
        });
        return n;
      });

      setEditModal(null);
    } catch (e) {
      console.error(e);
      alert('Failed to delete dish from database');
    }
  };

  // ------- Filtering (Daily, Highlighted, One dish) -------
  const filteredDishes = useMemo(() => {
    const dishFilter = view.filter;
    const onlyDishId = dishFilter === 'dish' ? (view.dishId ?? '') : '';

    function shouldRenderDishHeader(d: Dish): boolean {
      if (dishFilter === 'dish') return d.id === onlyDishId;
      if (dishFilter === 'highlighted') {
        return d.items.some((it) => {
          const k = rowKey(d.id, it);
          const hi = !!rowHi[k];
          const inDaily = view.mode !== 'daily' || !!(dailySel.items && dailySel.items[k]);
          return hi && inDaily;
        });
      }
      return true;
    }

    function visibleItemsOfDish(d: Dish): string[] {
      return d.items.filter((it) => {
        const k = rowKey(d.id, it);
        const inDaily = view.mode !== 'daily' || !!(dailySel.items && dailySel.items[k]);
        const hiFilterOk = dishFilter !== 'highlighted' || !!rowHi[k];
        return inDaily && hiFilterOk;
      });
    }

    return dishes
      .filter(shouldRenderDishHeader)
      .map((d) => ({ dish: d, items: visibleItemsOfDish(d) }));
  }, [dishes, view, rowHi, dailySel]);

  // Helper for “missing recipe” check (passed to child)
  const hasRecipe = (dishId: string, item: string) => {
    const k = rowKey(dishId, item);
    return !!(itemMeta[k]?.recipe || userRecipes[item] || RECIPE_MAP[item]);
  };

  // “One dish” dropdown value must always be a string
  const dishIdValue = view.filter === 'dish' ? (view.dishId ?? '') : '';

  return (
    <div>
      {/* --- Top Bar --- */}
      <div className="bar">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => setCompactMode((m) => !m)}>
          {compactMode ? 'Exit Compact Mode' : 'Compact Mode'}
        </button>

        {/* Save/Load iteration */}
        <button
          onClick={() => {
            const filename = prompt('Enter filename for save (e.g. my_prep.json):', 'prep.json');
            if (!filename) return;
            const data = { dishes, cells, rowHi, notes, view, dailySel, userRecipes };
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
          }}
        >
          Save Iteration
        </button>

        <input
          type="file"
          style={{ display: 'none' }}
          id="loadFileInput"
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
                const data = JSON.parse(text || '{}');
                setDishes(data.dishes || []);
                setCells(data.cells || {});
                setRowHi(data.rowHi || {});
                setNotes(data.notes || {});
                setView(data.view || { mode: 'full', filter: 'all', dishId: null });
                setDailySel(data.dailySel || { enabled: false, items: {} });
                setUserRecipes(data.userRecipes || {});
              } catch {
                alert('Error loading file');
              }
            };
            reader.readAsText(file);
          }}
        />
        <button
          onClick={() => {
            const el = document.getElementById('loadFileInput') as HTMLInputElement | null;
            if (el) el.click();
          }}
        >
          Load Iteration
        </button>

        <button onClick={openAddDish}>+ Add Dish</button>

        <select
          value={view.filter}
          onChange={(e) => {
            const f = e.target.value as FilterKind;
            if (f === 'dish') {
              const first = dishes[0]?.id ?? '';
              setView({ ...view, filter: f, dishId: view.dishId ?? first });
            } else {
              setView({ ...view, filter: f });
            }
          }}
        >
          <option value="all">Show: All dishes</option>
          <option value="dish">Show: One dish…</option>
          <option value="highlighted">Show: Highlighted only</option>
        </select>

        {view.filter === 'dish' && (
          <select
            value={dishIdValue}
            onChange={(e) => setView({ ...view, dishId: (e.target as HTMLSelectElement).value })}
          >
            {dishes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        {view.mode === 'daily' ? (
          <button onClick={() => setView({ ...view, mode: 'full' })}>Exit Daily List</button>
        ) : (
          <button onClick={openDailyPicker}>Daily List</button>
        )}
      </div>

      {/* --- Legend --- */}
      <Legend />

      {/* --- Real-time Notification --- */}
      {realtimeNotification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#4CAF50',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          🔄 {realtimeNotification}
        </div>
      )}

      {/* --- Tables (one per dish) --- */}
      <div className="card">
        <table>
          <tbody>
            {filteredDishes.map(({ dish, items }) => (
              <FragmentDishTable
                key={dish.id}
                dish={dish}
                items={items}
                sharedSet={sharedSet}
                cells={cells}
                rowHi={rowHi}
                notes={notes}
                onClickDish={() => openDishEditor(dish.id)}
                onClickItem={(item) => openRecipe(dish.id, item)}
                toggleCell={toggleCell}
                toggleRow={toggleRow}
                openNotes={openNotes}
                hasRecipe={hasRecipe}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* --- Recipe Modal --- */}
      {recipeModal && (
        <div className="overlay" onClick={() => setRecipeModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                Recipe —{' '}
                {(() => {
                  const d = dishes.find((x) => x.id === recipeModal.dishId);
                  const missing = !hasRecipe(recipeModal.dishId, recipeModal.item);
                  return (
                    (d ? d.name : '') + ': ' + recipeModal.item + (missing ? ' ⚠️ No Recipe' : '')
                  );
                })()}
              </div>
              <button onClick={() => setRecipeModal(null)}>Close</button>
            </header>
            <section>
              <div style={{ marginBottom: '8px' }}>
                <label>Scale: </label>
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value) || 1)}
                  style={{ width: '80px' }}
                />{' '}
                x
              </div>
              {editRecipe ? (
                <div>
                  <textarea
                    value={draftRecipe}
                    onChange={(e) => setDraftRecipe(e.target.value)}
                    rows={12}
                    style={{ width: '100%' }}
                  />
                  <div style={{ marginTop: '8px', display: 'flex', gap: 8 }}>
                    <button onClick={saveRecipe}>Save Recipe</button>
                    <button onClick={() => setEditRecipe(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {scaleRecipe(
                      (() => {
                        const k = rowKey(recipeModal.dishId, recipeModal.item);
                        const dbRecipe = itemMeta[k]?.recipe;
                        return (
                          dbRecipe ??
                          userRecipes[recipeModal.item] ??
                          RECIPE_MAP[recipeModal.item] ??
                          '[RECIPE NOT YET ENTERED]'
                        );
                      })(),
                      scale,
                    )}
                  </pre>
                  <button
                    onClick={() => {
                      const k = rowKey(recipeModal.dishId, recipeModal.item);
                      const dbRecipe = itemMeta[k]?.recipe;
                      setDraftRecipe(
                        dbRecipe ??
                          userRecipes[recipeModal.item] ??
                          RECIPE_MAP[recipeModal.item] ??
                          '',
                      );
                      setEditRecipe(true);
                    }}
                  >
                    Edit Recipe
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* --- Notes Modal --- */}
      {notesModal && (
        <div className="overlay" onClick={() => setNotesModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                Notes —{' '}
                {(() => {
                  const d = dishes.find((x) => x.id === notesModal.dishId);
                  return (d ? d.name : '') + ': ' + notesModal.item;
                })()}
              </div>
              <button onClick={() => setNotesModal(null)}>Close</button>
            </header>
            <section>
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={8}
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '8px',
                }}
                placeholder="Enter notes for this item..."
              />
              <div style={{ marginTop: '8px', display: 'flex', gap: 8 }}>
                <button onClick={saveNote}>Save Notes</button>
                <button onClick={() => setNotesModal(null)}>Cancel</button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* --- Edit Dish Modal --- */}
      {editModal && (
        <div className="overlay" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>Edit Dish</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditModal(null)}>Cancel</button>
                <button onClick={deleteDish} style={{ borderColor: '#dc2626', color: '#dc2626' }}>
                  Delete Dish
                </button>
                <button onClick={saveDishEditor}>
                  <strong>Save Changes</strong>
                </button>
              </div>
            </header>
            <section>
              <div className="row">
                <label style={{ width: 120 }}>Dish name</label>
                <input
                  type="text"
                  value={editModal.draftName}
                  onChange={(e) =>
                    setEditModal((m) => (m ? { ...m, draftName: e.target.value } : m))
                  }
                />
              </div>
              <div className="row">
                <label style={{ width: 120 }}>Add component</label>
                <input
                  type="text"
                  value={editModal.addBuffer}
                  onChange={(e) =>
                    setEditModal((m) => (m ? { ...m, addBuffer: e.target.value } : m))
                  }
                  placeholder="Type component and click Add"
                />
                <button onClick={addOneItem}>Add</button>
              </div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <label style={{ width: 120, marginTop: '8px' }}>Bulk add</label>
                <textarea
                  rows={4}
                  style={{
                    flex: 1,
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px',
                  }}
                  placeholder="Paste one component per line"
                  value={editModal.bulkBuffer}
                  onChange={(e) =>
                    setEditModal((m) => (m ? { ...m, bulkBuffer: e.target.value } : m))
                  }
                />
                <button onClick={addBulk}>Add Lines</button>
              </div>
              <div className="comp-list">
                <strong>Component</strong>
                <span></span>
                <span></span>
                <span></span>
                {editModal.draftItems.length ? (
                  editModal.draftItems.map((c, idx) => (
                    <div key={idx} style={{ display: 'contents' }}>
                      <input
                        type="text"
                        value={c}
                        onChange={(e) =>
                          setEditModal((m) => {
                            if (!m) return m;
                            const a = m.draftItems.slice();
                            a[idx] = e.target.value;
                            return { ...m, draftItems: a };
                          })
                        }
                      />
                      <button onClick={() => moveItem(idx, -1)}>Up</button>
                      <button onClick={() => moveItem(idx, 1)}>Down</button>
                      <button
                        onClick={() => removeItemAt(idx)}
                        style={{ borderColor: '#dc2626', color: '#dc2626' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="comp-empty">No components yet</div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* --- Add Dish / Daily Picker --- */}
      {addModal && !('dailyPicker' in addModal) && (
        <div className="overlay" onClick={() => setAddModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>Add Dish</div>
              <button onClick={() => setAddModal(null)}>Close</button>
            </header>
            <section>
              <div className="row">
                <label style={{ width: 120 }}>Dish name</label>
                <input
                  type="text"
                  value={addModal.name || ''}
                  onChange={(e) =>
                    setAddModal((m) =>
                      m && !('dailyPicker' in m) ? { ...m, name: e.target.value } : m,
                    )
                  }
                  placeholder="e.g., New Dish Name"
                />
              </div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <label style={{ width: 120, marginTop: '8px' }}>Components</label>
                <div style={{ flex: 1 }}>
                  {(addModal.comps || ['', '', '', '']).map((c, i) => (
                    <div className="row" key={i}>
                      <input
                        type="text"
                        value={c}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAddModal((m) => {
                            if (!m || 'dailyPicker' in m) return m;
                            const a = (m.comps || ['', '', '', '']).slice();
                            a[i] = v;
                            return { ...m, comps: a };
                          });
                        }}
                        placeholder={`Component ${i + 1}`}
                      />
                      <button onClick={() => removeDishField(i)}>Remove</button>
                    </div>
                  ))}
                  <button onClick={addDishField}>+ Add field</button>
                </div>
              </div>
            </section>
            <section style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setAddModal(null)}>Cancel</button>
              <button onClick={saveNewDish}>
                <strong>Save Dish</strong>
              </button>
            </section>
          </div>
        </div>
      )}

      {addModal && 'dailyPicker' in addModal && addModal.dailyPicker && (
        <div className="overlay" onClick={() => setAddModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>Create Daily Checklist</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setAddModal(null)}>Cancel</button>
                <button onClick={saveDailySelection}>
                  <strong>Save Daily List</strong>
                </button>
              </div>
            </header>
            <section>
              <p className="muted">
                Select the components you are responsible for today. This list will persist until
                you reset it.
              </p>
              <div className="grid">
                {dishes.map((d) => (
                  <div key={d.id} className="box">
                    <strong>{d.name}</strong>
                    <div>
                      {d.items.map((it) => {
                        const k = rowKey(d.id, it);
                        return (
                          <div key={k}>
                            <input
                              className="daily-pick checkbox"
                              type="checkbox"
                              data-key={k}
                              defaultChecked={!!(dailySel.items && dailySel.items[k])}
                              id={k}
                            />
                            <label htmlFor={k}>{it}</label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Presentational fragment for one dish "table" ----------
function FragmentDishTable(props: {
  dish: Dish;
  items: string[];
  sharedSet: Set<string>;
  cells: Record<string, boolean>;
  rowHi: Record<string, boolean>;
  notes: Record<string, string>;
  onClickDish: () => void;
  onClickItem: (item: string) => void;
  toggleCell: (dishId: string, item: string, kind: 'on' | 'prep') => void;
  toggleRow: (dishId: string, item: string) => void;
  openNotes: (dishId: string, item: string) => void;
  hasRecipe: (dishId: string, item: string) => boolean;
}) {
  const {
    dish,
    items,
    sharedSet,
    cells,
    rowHi,
    notes,
    onClickDish,
    onClickItem,
    toggleCell,
    toggleRow,
    openNotes,
    hasRecipe,
  } = props;

  return (
    <>
      <tr>
        <th className="dish" colSpan={5} onClick={onClickDish} title="Click to edit this dish">
          {dish.name}
        </th>
      </tr>
      {items.length === 0 ? (
        <tr key={`${dish.id}-empty`}>
          <td className="body" colSpan={5}>
            <em className="comp-empty">No items to show</em>
          </td>
        </tr>
      ) : (
        items.map((item) => {
          const k = rowKey(dish.id, item);
          const shared = sharedSet.has(item);
          const onKey = `${k}|on`;
          const prepKey = `${k}|prep`;
          const isOn = !!cells[onKey];
          const isPrep = !!cells[prepKey];
          const hi = !!rowHi[k];
          const missingRecipe = !hasRecipe(dish.id, item);

          return (
            <tr key={k} className={`${shared ? 'shared ' : ''}${hi ? 'row-hi' : ''}`}>
              <td
                className="body name"
                onClick={() => onClickItem(item)}
                style={{ cursor: 'pointer' }}
              >
                {shared && <span className="shared-indicator"></span>}
                {item} {missingRecipe && <span className="missing-recipe">⚠️</span>}
              </td>
              <td
                className={`body toggle ${isOn ? 'on' : ''}`}
                onClick={() => toggleCell(dish.id, item, 'on')}
              >
                On Hand
              </td>
              <td
                className={`body toggle ${isPrep ? 'prep' : ''}`}
                onClick={() => toggleCell(dish.id, item, 'prep')}
              >
                Prep
              </td>
              <td className="body notes">
                <button
                  onClick={() => openNotes(dish.id, item)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: notes[k] ? '#333' : '#999',
                  }}
                  title={notes[k] ? `Notes: ${notes[k]}` : 'Add notes'}
                >
                  ✏️
                </button>
              </td>
              <td className="body star">
                <button title="Row highlight" onClick={() => toggleRow(dish.id, item)}>
                  ★
                </button>
              </td>
            </tr>
          );
        })
      )}
    </>
  );
}
