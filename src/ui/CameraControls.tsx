import { useAppStore } from "../state/store";
import { useRef, useState } from "react";
import { CAMERA_CONTROL_DESCRIPTORS, CAMERA_MODES, CAMERA_PRESETS } from "../scene/cameraActions";
import { PAN_PLANE_AXES, PAN_PLANES } from "../scene/cameraNavigation";

export function CameraControls() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const preset = useAppStore((state) => state.preset);
  const panPlane = useAppStore((state) => state.panPlane);
  return <aside className="camera-cluster" aria-label="Camera controls"
    onBlur={(event) => {
      if (window.matchMedia("(max-width: 700px)").matches && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !open) return;
      event.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
    }}>
    <button ref={toggle} className="btn camera-toggle" aria-expanded={open} aria-controls="camera-controls" onClick={() => setOpen(!open)}>Camera</button>
    {open && <div className="panel camera-control-panel" id="camera-controls">
      <fieldset className="segmented"><legend className="sr-only">Camera</legend>{CAMERA_PRESETS.map((value) => <button className={preset === value ? "seg active" : "seg"} key={value} aria-pressed={preset === value} onClick={() => useAppStore.getState().setPreset(value)}>{preset === value && <span aria-hidden="true">✓ </span>}{value}</button>)}</fieldset>
      <fieldset className="segmented"><legend className="sr-only">World pan plane</legend>{PAN_PLANES.map((plane) => {
        const [horizontal, vertical] = PAN_PLANE_AXES[plane];
        return <button className={panPlane === plane ? "seg active" : "seg"} key={plane} aria-pressed={panPlane === plane} title={`Pan ${plane.toUpperCase()}: horizontal ${horizontal.toUpperCase()}, vertical ${vertical.toUpperCase()}`} onClick={() => useAppStore.getState().setPanPlane(plane)}>{panPlane === plane && <span aria-hidden="true">✓ </span>}pan {plane.toUpperCase()}</button>;
      })}</fieldset>
      <fieldset className="segmented camera-commands"><legend className="sr-only">Camera position</legend>{CAMERA_CONTROL_DESCRIPTORS.filter((control) => !control.orbitOnly).map((control) => <button key={control.id} className="seg camera-command" aria-label={control.label} aria-controls="trace-camera" aria-keyshortcuts={control.key} onClick={() => useAppStore.getState().dispatchCameraInput(control.command)} title={`${control.label} (${control.key})`}>{control.symbol}</button>)}</fieldset>
      {preset === "orbit" && <fieldset className="segmented camera-commands"><legend className="sr-only">Camera rotation</legend>{CAMERA_CONTROL_DESCRIPTORS.filter((control) => control.orbitOnly).map((control) => <button key={control.id} className="seg camera-command camera-command-wide" aria-label={control.label} aria-controls="trace-camera" aria-keyshortcuts={control.key} onClick={() => useAppStore.getState().dispatchCameraInput(control.command)} title={`${control.label} (${control.key})`}>{control.symbol}</button>)}</fieldset>}
      <CameraActions />
    </div>}
  </aside>;
}

function CameraActions() {
  const cameraMode = useAppStore((state) => state.cameraMode);
  const view = useAppStore((state) => state.view);
  const setCameraMode = useAppStore((state) => state.setCameraMode);
  const selection = useAppStore((state) => state.selection);
  const analysisScope = useAppStore((state) => state.analysisScope);
  const findings = useAppStore((state) => state.analysisFindings);
  const regressionProjection = useAppStore(
    (state) => state.analysisRegressionProjection,
  );
  const focusAnalysisFinding = useAppStore(
    (state) => state.focusAnalysisFinding,
  );
  const cameraCommand = useAppStore((state) => state.cameraCommand);
  const requestCameraAction = useAppStore(
    (state) => state.requestCameraAction,
  );
  const selectedFinding = findings.find(
    (finding) => finding.id === analysisScope?.selectedFindingId,
  );
  const selectedRegressionMark = regressionProjection?.marks.find(
    (mark) => mark.findingId === analysisScope?.selectedFindingId,
  );
  const canFitSelection = selection !== null ||
    (view === "diff" && selectedRegressionMark !== undefined);
  const canFocusFinding = (regressionProjection?.marks.length ?? 0) > 1;

  return (
    <>
      <fieldset className="segmented camera-actions">
        <legend className="sr-only">Camera mode</legend>
        {CAMERA_MODES.map((mode) => (
          <button
            type="button"
            className={cameraMode === mode ? "seg active" : "seg"}
            aria-pressed={cameraMode === mode}
            title={mode === "strategy" ? "Keep the camera above ground" : "Orbit freely, including below ground"}
            key={mode}
            onClick={() => setCameraMode(mode)}
          >
            {cameraMode === mode ? <span aria-hidden="true">✓ </span> : null}
            {mode === "strategy" ? "Strategy camera" : "Free camera"}
          </button>
        ))}
      </fieldset>
      <fieldset className="segmented camera-actions">
        <legend className="sr-only">Camera framing</legend>
        <button
          type="button"
          className="seg"
          onClick={() => requestCameraAction("fit-all")}
        >
          Fit all
        </button>
        <button
          type="button"
          className="seg"
          disabled={!canFitSelection}
          onClick={() => requestCameraAction("fit-selection")}
        >
          Fit selection
        </button>
        <button
          type="button"
          className="seg"
          onClick={() => requestCameraAction("reset")}
        >
          Reset view
        </button>
      </fieldset>
      <fieldset className="segmented camera-actions">
        <legend className="sr-only">Finding focus</legend>
        <button
          type="button"
          className="seg"
          disabled={!canFocusFinding}
          aria-controls="trace-camera"
          onClick={() => focusAnalysisFinding("previous")}
        >
          Previous finding
        </button>
        <button
          type="button"
          className="seg"
          disabled={!canFocusFinding}
          aria-controls="trace-camera"
          onClick={() => focusAnalysisFinding("next")}
        >
          Next finding
        </button>
      </fieldset>
      <output
        className="sr-only"
        role="status"
        aria-label="Camera status"
        aria-live="polite"
      >
        {selectedFinding
          ? `Focused finding ${selectedFinding.title}`
          : `Camera action ${cameraCommand.kind}`}
      </output>
    </>
  );
}
