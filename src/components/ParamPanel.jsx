import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTargetParams, PARAM_META, DEFAULT_PARAMS } from "../state/useTargetParams";
import "./ParamPanel.css";

const PARAM_KEYS = Object.keys(DEFAULT_PARAMS);

export function ParamPanel() {
  const [open, setOpen] = useState(true);
  const params = useTargetParams(
    useShallow((s) => Object.fromEntries(PARAM_KEYS.map((k) => [k, s[k]])))
  );
  const setParam = useTargetParams((s) => s.setParam);
  const reset = useTargetParams((s) => s.reset);

  return (
    <div className={`param-panel ${open ? "open" : "closed"}`}>
      <button
        type="button"
        className="param-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Target parameters</span>
        <span className="param-panel__chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="param-panel__body">
          {PARAM_KEYS.map((key) => {
            const meta = PARAM_META[key];
            const value = params[key];
            return (
              <div key={key} className="param-row">
                <label className="param-row__label" htmlFor={`param-${key}`}>
                  {meta.label}
                  <span className="param-row__unit">{meta.unit}</span>
                </label>
                <div className="param-row__controls">
                  <input
                    id={`param-${key}`}
                    type="range"
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    value={value}
                    onChange={(e) => setParam(key, e.target.value)}
                  />
                  <input
                    className="param-row__number"
                    type="number"
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    value={value}
                    onChange={(e) => setParam(key, e.target.value)}
                  />
                </div>
              </div>
            );
          })}

          <button type="button" className="param-panel__reset" onClick={reset}>
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
