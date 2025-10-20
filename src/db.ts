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
  const { error } = await sb.from('dishes').delete().eq('id', dish_id);
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
  const { error } = await sb.from('items').delete().eq('id', item_id);
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

export async function initializeRowStates() {
  try {
    // Get all items
    const { data: allItems, error: itemsError } = await sb
      .from('items')
      .select('id, dish_id');
    
    if (itemsError) throw itemsError;
    
    // Get existing row_state entries
    const { data: existingStates, error: statesError } = await sb
      .from('row_state')
      .select('item_id');
    
    if (statesError) throw statesError;
    
    const existingItemIds = new Set(existingStates?.map(s => s.item_id) || []);
    
    // Find items that don't have row_state entries
    const itemsToCreate = allItems?.filter(item => !existingItemIds.has(item.id)) || [];
    
    if (itemsToCreate.length > 0) {
      console.log(`Creating row_state entries for ${itemsToCreate.length} items`);
      
      // Insert default row_state entries for items that don't have them
      const defaultStates = itemsToCreate.map(item => ({
        dish_id: item.dish_id,
        item_id: item.id,
        state: '',
        note: '',
        starred: false,
        updated_at: new Date().toISOString(),
      }));
      
      const { error: insertError } = await sb
        .from('row_state')
        .insert(defaultStates);
        
      if (insertError) throw insertError;
      
      console.log(`Successfully created ${defaultStates.length} row_state entries`);
    } else {
      console.log('All items already have row_state entries');
    }
  } catch (e) {
    console.error('Failed to initialize row states:', e);
  }
}

export async function syncRowState(params: {
  dish_id: string;
  item_id: string;
  notes?: string;
  on_hand?: boolean;
  prep?: boolean;
  highlighted?: boolean;
}) {
  try {
    console.log('syncRowState called with:', params);
    
    const updateData: any = {
      dish_id: params.dish_id,
      item_id: params.item_id,
      updated_at: new Date().toISOString(),
    };
    
    if (params.notes !== undefined) updateData.note = params.notes;
    if (params.on_hand !== undefined) updateData.state = params.on_hand ? 'on' : '';
    if (params.prep !== undefined) updateData.state = params.prep ? 'prep' : '';
    if (params.highlighted !== undefined) updateData.starred = params.highlighted;
    
    console.log('Updating row_state with:', updateData);
    
    await upsertRowState({
      dish_id: params.dish_id,
      item_id: params.item_id,
      note: params.notes,
      state: params.on_hand ? 'on' : params.prep ? 'prep' : '',
      starred: params.highlighted,
    });
    
    console.log('Row state synced successfully');
  } catch (e) {
    console.error('Failed to sync row state:', e);
  }
}

export function subscribeToChanges(
  onDishChange: (payload: any) => void, 
  onItemChange: (payload: any) => void,
  onRowStateChange?: (payload: any) => void
) {
  const dishesChannel = sb
    .channel('dishes_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, onDishChange)
    .subscribe();

  const itemsChannel = sb
    .channel('items_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onItemChange)
    .subscribe();

  const channels = [dishesChannel, itemsChannel];

  if (onRowStateChange) {
    const rowStateChannel = sb
      .channel('row_state_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'row_state' }, onRowStateChange)
      .subscribe();
    channels.push(rowStateChannel);
  }

  return () => {
    channels.forEach(channel => sb.removeChannel(channel));
  };
}
