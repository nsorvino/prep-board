import type { Dish } from '../types';
import { useRowState } from '../hooks/useRowState';

interface Props {
  dishes: Dish[];
  onAddItem: (dishId: string) => void;
}
export function Table({ dishes, onAddItem }: Props) {
  const { toggles, notes, stars, toggleCell, setNote, flipStar, keyFor } = useRowState();
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th className="dish">Dish</th>
            <th>Item</th>
            <th className="toggle">State</th>
            <th className="notes">Notes</th>
            <th className="star">★</th>
          </tr>
        </thead>
        <tbody>
          {dishes
            .map((dish) => (
              <tr key={dish.id + '-hdr'}>
                <td className="dish" colSpan={5}>
                  {dish.name}
                  <button style={{ marginLeft: 8 }} onClick={() => onAddItem(dish.id)}>
                    + Add item
                  </button>
                </td>
              </tr>
            ))
            .flat()}
          {dishes.flatMap((dish) =>
            dish.items.length === 0
              ? [
                  <tr key={dish.id + '-empty'}>
                    <td className="body" colSpan={5}>
                      <em className="comp-empty">No items yet</em>
                    </td>
                  </tr>,
                ]
              : dish.items.map((it, idx) => {
                  const k = keyFor({ dishId: dish.id, itemIdx: idx });
                  const t = toggles[k] ?? '';
                  const star = !!stars[k];
                  return (
                    <tr key={k}>
                      <td className="body name">{dish.name}</td>
                      <td className="body">{it}</td>
                      <td
                        className={`toggle ${t}`}
                        onClick={() => toggleCell({ dishId: dish.id, itemIdx: idx })}
                      >
                        {t === '' ? '—' : t.toUpperCase()}
                      </td>
                      <td className="notes body">
                        <input
                          value={notes[k] ?? ''}
                          onChange={(e) =>
                            setNote({ dishId: dish.id, itemIdx: idx }, e.target.value)
                          }
                          placeholder="Add note…"
                        />
                      </td>
                      <td className="star body">
                        <button
                          className="td-star-btn"
                          onClick={() => flipStar({ dishId: dish.id, itemIdx: idx })}
                        >
                          {star ? '★' : '☆'}
                        </button>
                      </td>
                    </tr>
                  );
                }),
          )}
        </tbody>
      </table>
    </div>
  );
}
