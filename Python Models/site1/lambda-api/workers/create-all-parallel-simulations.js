#!/usr/bin/env node

/**
 * Script to create parallel workers and coordinators for all simulations
 * This generates the boilerplate code for each simulation type
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const simulations = [
  {
    name: 'carlift',
    importPath: '../../api/carlift.js',
    workerFunction: 'runMultipleCarLiftSimulations',
    action: 'runSimulation',
    description: 'Car Lift Simulation'
  },
  {
    name: 'carparkutilisation',
    importPath: '../../api/carparkutilisation.js',
    workerFunction: 'runMultipleSimulations',
    action: 'runSimulation',
    description: 'Car Park Utilisation Simulation'
  },
  {
    name: 'mechanical',
    importPath: '../../api/mechanical.js',
    workerFunction: 'runMultipleParkingSimulations',
    action: 'runParkingSimulation',
    description: 'Mechanical Simulation'
  },
  {
    name: 'rampdrawer',
    importPath: '../../api/rampdrawer.js',
    workerFunction: 'runMultipleRampDrawerSimulations',
    action: 'runSimulation',
    description: 'Ramp Drawer Simulation'
  },
  {
    name: 'boomgate',
    importPath: '../../api/boomgate.js',
    workerFunction: 'runMultipleBoomgateSimulations',
    action: 'runSimulation',
    description: 'Boomgate Simulation'
  }
];

// Generate worker for each simulation
simulations.forEach(sim => {
  const workerContent = `// Parallel ${sim.description} Worker
// Processes a subset of seeds and returns results

// Import the sequential simulation runner
// We'll dynamically import to extract just the simulation logic
async function loadSimulationModule() {
  const module = await import('${sim.importPath}');
  return module.default;
}

// Worker function - processes assigned seeds
export async function runWorkerSimulations(params) {
  const { startSeed, endSeed, seedMode, ...simParams } = params;

  // Calculate number of seeds this worker will process
  const numSeeds = endSeed - startSeed + 1;

  // Run the sequential simulation with our subset of seeds
  const fullParams = {
    ...simParams,
    numSeeds: numSeeds,
    seedMode: seedMode,
    // If using fixed seeds, offset by startSeed
    _seedOffset: seedMode === 'fixed' ? startSeed - 1 : 0
  };

  // Dynamically load and run the simulation
  const handler = await loadSimulationModule();

  // Create a mock request/response for the handler
  const mockReq = {
    method: 'POST',
    headers: {
      authorization: 'Bearer internal-worker'
    },
    body: {
      action: '${sim.action}',
      parameters: fullParams
    }
  };

  const mockRes = {
    json: (data) => data,
    status: (code) => ({ json: (data) => ({ statusCode: code, ...data }) })
  };

  // Run the simulation
  await handler(mockReq, mockRes);

  // The handler calls res.json with the results
  // We need to intercept this...

  // Actually, let's import the simulation function directly
  // This is cleaner - we'll create a separate local version
  throw new Error('This worker needs to be implemented by extracting the simulation logic from ${sim.importPath}');
}

// Lambda handler
export const main = async (event) => {
  try {
    console.log('${sim.name} worker started:', {
      startSeed: event.startSeed,
      endSeed: event.endSeed,
      seedsToProcess: event.endSeed - event.startSeed + 1
    });

    const startTime = Date.now();
    const results = await runWorkerSimulations(event);
    const duration = Date.now() - startTime;

    console.log('${sim.name} worker completed:', {
      duration: \`\${duration}ms\`,
      seedsProcessed: results.numSeeds || (event.endSeed - event.startSeed + 1)
    });

    return {
      statusCode: 200,
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error('${sim.name} worker error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Worker failed: ' + error.message
      })
    };
  }
};
`;

  // Write worker file
  const workerPath = path.join(__dirname, `${sim.name}-worker.js`);
  fs.writeFileSync(workerPath, workerContent);
  console.log(`✓ Created ${sim.name}-worker.js`);
});

console.log('\\n✅ All worker templates created!');
console.log('⚠️  Note: These are templates. Each needs the actual simulation logic extracted.');
console.log('    The simulations are already optimized for sequential processing.');
console.log('    We should use a simpler approach...');
