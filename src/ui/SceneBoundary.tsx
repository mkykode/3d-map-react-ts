import { Component, type ErrorInfo, type ReactNode } from "react";

export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("3D renderer failed", error, info.componentStack); }
  render() {
    if (this.state.failed) return <div className="scene-fallback" role="alert">
      <h3>The 3D renderer could not start.</h3>
      <p>Your trace and analysis are still available. Check that hardware acceleration is enabled, then retry.</p>
      <button className="btn" onClick={() => this.setState({ failed: false })}>Retry 3D renderer</button>
    </div>;
    return this.props.children;
  }
}
