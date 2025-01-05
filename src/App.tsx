import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import TopoMap, { TraceData, processTraceEvents } from "./components/TopoMap";
import Legend from "./components/Legend";
import { useState } from "react";

function App() {
  const [traceData, setTraceData] = useState<TraceData[]>([]);
  const handleTraceUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          const events = json.traceEvents || [];
          const processedData = processTraceEvents(events);
          console.log('Processed trace data:', processedData);
          setTraceData(processedData);
        } catch (error) {
          console.error("Error parsing trace file:", error);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1 }}>
        <input
          type="file"
          accept=".json"
          onChange={handleTraceUpload}
          style={{ color: "white" }}
        />
      </div>
      <Legend />
      <Canvas 
        camera={{ 
          position: [20, 20, 20], // Moved further back
          fov: 75 
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <TopoMap traceData={traceData} />
        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default App;
