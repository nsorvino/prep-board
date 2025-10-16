// src/db.ts
import { sb } from './supabase';
import type { DishRow, ItemRow, RowStateRow, ToggleState } from './types';

export async function fetchAll() {
  const [dishes, items, states] = await Promise.all([
    sb.from('dishes').select('*').order('created_at', { ascending: true }),
    sb.from('items').select('*').order('position', { ascending: true }),
    sb.from('row_state').select('*'),
  ]);
  if (dishes.error) throw dishes.error;
  if (items.error) throw items.error;
  if (states.error) throw states.error;
  return {
    dishes: dishes.data as DishRow[],
    items: items.data as ItemRow[],
    states: states.data as RowStateRow[],
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
