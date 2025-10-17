// src/db.ts
import { sb } from './supabase';
import type { DishRow, ItemRow, RowStateRow, ToggleState } from './types';

export async function fetchAll() {
  const [dishes, items, states] = await Promise.all([
    sb.from('dishes').select('*'),
    sb.from('items').select('id,dish_id,name,position,recipe'),
    sb.from('row_state').select('*'),
  ]);
  if (dishes.error) throw dishes.error;
  if (items.error) throw items.error;
  // row_state is optional; ignore errors so it doesn't block rendering
  return {
    dishes: dishes.data as DishRow[],
    items: items.data as ItemRow[],
    states: states.error ? ([] as RowStateRow[]) : (states.data as RowStateRow[]),
  };
}

export async function insertDish(name: string) {
  const { data, error } = await sb.from('dishes').insert({ name }).select().single();
  if (error) throw error;
  return data as DishRow;
}

export async function insertItem(dish_id: string, name: string, position = 0) {
  const { data, error } = await sb
    .from('items')
    .insert({ dish_id, name, position })
    .select()
    .single();
  if (error) throw error;
  return data as ItemRow;
}

export async function updateItemRecipe(item_id: string, recipe: string) {
  const { data, error } = await sb
    .from('items')
    .update({ recipe })
    .eq('id', item_id)
    .select()
    .single();
  if (error) throw error;
  return data as ItemRow;
}

export async function updateDish(dish_id: string, name: string) {
  const { data, error } = await sb
    .from('dishes')
    .update({ name })
    .eq('id', dish_id)
    .select()
    .single();
  if (error) throw error;
  return data as DishRow;
}

export async function deleteDish(dish_id: string) {
  const { error } = await sb
    .from('dishes')
    .delete()
    .eq('id', dish_id);
  if (error) throw error;
}

export async function updateItem(item_id: string, name: string, position?: number) {
  const { data, error } = await sb
    .from('items')
    .update({ name, position })
    .eq('id', item_id)
    .select()
    .single();
  if (error) throw error;
  return data as ItemRow;
}

export async function deleteItem(item_id: string) {
  const { error } = await sb
    .from('items')
    .delete()
    .eq('id', item_id);
  if (error) throw error;
}

export async function upsertRowState(params: {
  dish_id: string;
  item_id: string;
  state?: ToggleState;
  note?: string;
  starred?: boolean;
}) {
  const { data, error } = await sb
    .from('row_state')
    .upsert(
      {
        dish_id: params.dish_id,
        item_id: params.item_id,
        state: params.state ?? '',
        note: params.note ?? '',
        starred: params.starred ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'item_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as RowStateRow;
}

export function subscribeRowState(onChange: (row: RowStateRow) => void) {
  const channel = sb
    .channel('row_state_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'row_state' }, (payload) =>
      onChange(payload.new as RowStateRow),
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
