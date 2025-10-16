// src/types.ts
export interface DishRow {
  id: string;
  name: string;
} // DB row (dishes)
export interface ItemRow {
  id: string;
  dish_id: string;
  name: string;
  position?: number;
} // DB row (items)

export interface RowStateRow {
  id: string;
  dish_id: string;
  item_id: string;
  state: '' | 'on' | 'prep';
  note: string;
  starred: boolean;
  updated_at?: string;
}

// UI shape used by <Table /> when items are strings:
export interface Dish {
  id: string;
  name: string;
  items: string[];
}

// Alternative UI shape when items are ids+names (not used by Table right now):
export interface DishUI {
  id: string;
  name: string;
  items: { id: string; name: string }[];
}

export type ToggleState = '' | 'on' | 'prep';
export type Filter = 'all' | 'starred' | 'on' | 'prep';

// RowKey is used for composing keys in local state maps
export interface RowKey {
  dishId: string;
  itemIdx: number;
}
