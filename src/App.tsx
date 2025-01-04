import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import TopoMap from './components/TopoMap'

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{ position: [10, 10, 10], fov: 75 }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <TopoMap />
        <OrbitControls />
      </Canvas>
    </div>
  )
}



export default App
