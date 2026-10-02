import { useShallow } from "zustand/react/shallow";
import { ParamPanel } from "./ParamPanel";
import { useTargetParams, PARAM_META } from "../state/useTargetParams";
import { useFlyingObjectParams, FLYING_OBJECT_PARAM_META } from "../state/useFlyingObjectParams";

const pickKeys = (meta) => (state) =>
  Object.fromEntries(Object.keys(meta).map((key) => [key, state[key]]));
const pickTargetParams = pickKeys(PARAM_META);
const pickFlyingObjectParams = pickKeys(FLYING_OBJECT_PARAM_META);

function TargetParamPanel() {
  const values = useTargetParams(useShallow(pickTargetParams));
  const setParam = useTargetParams((s) => s.setParam);
  const reset = useTargetParams((s) => s.reset);
  return (
    <ParamPanel title="Target parameters" meta={PARAM_META} values={values} onChange={setParam} onReset={reset} />
  );
}

function FlyingObjectParamPanel() {
  const values = useFlyingObjectParams(useShallow(pickFlyingObjectParams));
  const setParam = useFlyingObjectParams((s) => s.setParam);
  const reset = useFlyingObjectParams((s) => s.reset);
  return (
    <ParamPanel title="Flying object parameters" meta={FLYING_OBJECT_PARAM_META} values={values} onChange={setParam} onReset={reset} />
  );
}

export function ParamPanels() {
  return (
    <div className="param-panels">
      <TargetParamPanel />
      <FlyingObjectParamPanel />
    </div>
  );
}
