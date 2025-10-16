export function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <span>
        <i className="swatch" style={{ background: 'var(--on)' }} aria-hidden /> On
      </span>
      <span>
        <i className="swatch" style={{ background: 'var(--prep)' }} aria-hidden /> Prep
      </span>
      <span>
        <i
          className="swatch"
          style={{ background: '#fff', borderColor: 'var(--border)' }}
          aria-hidden
        />{' '}
        Normal row
      </span>
      <span>
        <i className="swatch" style={{ background: 'var(--shared)' }} aria-hidden /> Shared row
      </span>
      <span>
        <i className="swatch" style={{ background: 'var(--highlight)' }} aria-hidden /> Highlighted
        row
      </span>
      <span>
        <i
          className="swatch"
          style={{ background: 'var(--header)', borderColor: 'var(--header)' }}
          aria-hidden
        />{' '}
        Dish header
      </span>
      <span>★ / ☆ Star</span>
    </div>
  );
}
