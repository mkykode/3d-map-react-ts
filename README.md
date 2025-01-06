# 3D Trace Data Visualization Tool

A powerful 3D visualization tool built with React, Three.js, and TypeScript that transforms Chrome DevTools trace data into an interactive topographical map. This tool helps developers analyze and understand complex trace data through intuitive visual representation.

## Features

- **3D Topographical Visualization**: Converts trace data into an interactive 3D terrain map
- **Color-Coded Categories**: Different event categories are represented by distinct color schemes
- **Interactive Controls**: Orbit, zoom, and pan capabilities for detailed exploration
- **Real-time Data Processing**: Dynamic processing of Chrome DevTools trace files
- **Customizable Visualization**: Adjustable height mapping and color schemes
- **Event Category Legend**: Clear visual reference for different event types

## Event Categories

The tool categorizes trace events into several main groups:
- Metadata
- Task Execution
- JavaScript
- Rendering
- Networking
- Navigation
- Memory
- Input
- Browser
- Other

## Getting Started

### Prerequisites

Choose one of the following runtimes:
- Bun.js (recommended) - faster installation and execution
- Node.js (v14 or higher) with npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/3d-trace-visualization.git
cd 3d-trace-visualization
```

2. Install dependencies:

Using Bun (recommended):
```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install
```

Using npm/yarn:
```bash
npm install
# or
yarn install
```

3. Start the development server:

Using Bun:
```bash
bun dev
```

Using npm/yarn:
```bash
npm start
# or
yarn start
```

### Why Bun?

We recommend using Bun for this project because:
- Significantly faster installation times
- Better TypeScript performance
- Built-in bundler and test runner
- Compatible with existing Node.js packages
- Improved development experience with faster hot reloading

### Usage

1. Open the application in your browser
2. Click the file input button to upload a Chrome DevTools trace file (.json)
3. The visualization will automatically generate once the file is processed
4. Use mouse controls to explore the visualization:
   - Left click + drag to rotate
   - Right click + drag to pan
   - Scroll to zoom

## Technical Details

### Core Technologies

- React
- Three.js
- TypeScript
- React Three Fiber
- Simplex Noise
- Bun.js runtime

### Key Components

- `TopoMap`: Main visualization component
- `Legend`: Category color reference
- Event categorization system
- Color mapping system

### Data Processing

The tool processes trace data through several steps:
1. File parsing
2. Event filtering
3. Data normalization
4. Height mapping
5. Color assignment

## Development

### Using Bun for Development

Bun provides several advantages during development:

```bash
# Run development server
bun dev

# Run tests
bun test

# Build for production
bun build

# Run TypeScript type checking
bun run typecheck
```

### Environment Setup

Create a `.env` file in the root directory:
```env
RUNTIME=bun
PORT=3000
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Troubleshooting

### Common Issues with Bun

1. If you encounter module resolution issues:
```bash
bun install --force
```

2. For TypeScript path aliases, ensure your `tsconfig.json` is properly configured:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Three.js community
- React Three Fiber team
- Chrome DevTools team for the trace data format
- Bun.js team for the runtime
