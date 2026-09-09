import { useAppStore } from "../state/store";
import { CAMERA_MODES } from "../scene/cameraActions";

export function CameraControls() {
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
