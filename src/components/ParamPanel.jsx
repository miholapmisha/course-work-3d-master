import { useId, useState } from "react";
import "./ParamPanel.css";

export function ParamPanel({ title, meta, values, onChange, onReset }) {
  const [open, setOpen] = useState(true);
  const idPrefix = useId();

  return (
    <div className={`param-panel ${open ? "open" : "closed"}`}>
      <button
        type="button"
        className="param-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="param-panel__chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="param-panel__body">
          {Object.entries(meta).map(([key, m]) => {
            const id = `${idPrefix}-${key}`;
            return (
              <div key={key} className="param-row">
                <label className="param-row__label" htmlFor={id}>
                  {m.label}
                  <span className="param-row__unit">{m.unit}</span>
                </label>
                <div className="param-row__controls">
                  <input
                    id={id}
                    type="range"
                    min={m.min}
                    max={m.max}
                    step={m.step}
                    value={values[key]}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                  <input
                    className="param-row__number"
                    type="number"
                    min={m.min}
                    max={m.max}
                    step={m.step}
                    value={values[key]}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                </div>
              </div>
            );
          })}

          <button type="button" className="param-panel__reset" onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
