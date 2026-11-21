import { useId, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';

/**
 * Searchable multi-select with chips. When the search text matches nothing,
 * `onCreate(name)` can add a new option inline (e.g. a new category).
 */
export default function MultiPicker({
  label,
  options,
  selectedIds,
  onChange,
  onCreate,
  placeholder = 'Search…',
  emptyText = 'Nothing here yet.',
}) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selected = selectedIds
    .map((id) => options.find((option) => option.id === id))
    .filter(Boolean);
  const term = query.trim().toLowerCase();
  const visible = term
    ? options.filter((option) => option.name.toLowerCase().includes(term))
    : options;
  const exactMatch = options.some((option) => option.name.toLowerCase() === term);

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  }

  async function handleCreate() {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    setError('');
    try {
      const created = await onCreate(query.trim());
      onChange([...selectedIds, created.id]);
      setQuery('');
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="field picker">
      <label className="field__label" htmlFor={inputId}>{label}</label>

      {selected.length > 0 ? (
        <ul className="picker__chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {selected.map((option) => (
            <li key={option.id} className="picker__chip">
              {option.name}
              <button type="button" onClick={() => toggle(option.id)} aria-label={`Remove ${option.name}`}>
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="picker__box">
        <div className="picker__search">
          <Search size={15} aria-hidden="true" />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (visible.length === 1) toggle(visible[0].id);
                else if (!exactMatch && onCreate) handleCreate();
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
          />
        </div>

        <ul className="picker__options" role="listbox" aria-multiselectable="true" aria-label={label}>
          {visible.map((option) => {
            const isSelected = selectedIds.includes(option.id);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`picker__option${isSelected ? ' is-selected' : ''}`}
                  onClick={() => toggle(option.id)}
                >
                  <span className="picker__check" aria-hidden="true">
                    {isSelected ? <Check size={13} /> : null}
                  </span>
                  {option.name}
                </button>
              </li>
            );
          })}
          {visible.length === 0 && !term ? <li className="picker__empty">{emptyText}</li> : null}
          {visible.length === 0 && term && !onCreate ? <li className="picker__empty">No matches.</li> : null}
        </ul>

        {onCreate && term && !exactMatch ? (
          <button type="button" className="picker__create" onClick={handleCreate} disabled={creating}>
            <Plus size={14} aria-hidden="true" />
            {creating ? 'Creating…' : `Create “${query.trim()}”`}
          </button>
        ) : null}
      </div>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </div>
  );
}
