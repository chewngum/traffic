// Generic Parallel Simulation Coordinator
// Works with ANY simulation by splitting seeds across multiple Lambda invocations

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  handleCORS,
  parseBody,
  getMethod,
  errorResponse,
  createResponse
} from '../lib/lambda-utils.js';

/**
 * Generic parallel coordinator that can work with any simulation endpoint
 * @param {object} event - API Gateway event
 * @param {string} targetFunctionName - Name of the target Lambda function
 * @param {string} expectedAction - Expected action name (e.g., 'runSimulation')
 * @returns {object} API Gateway response
 */
export async function createParallelCoordinator(event, targetFunctionName, expectedAction) {
  try {
    // Handle CORS
    const corsResponse = handleCORS(event);
    if (corsResponse) return corsResponse;

    // Only accept POST
    if (getMethod(event) !== 'POST') {
      return errorResponse(405, 'Method not allowed');
    }

    // Parse body
    const { action, parameters } = parseBody(event);

    if (action !== expectedAction) {
      return errorResponse(400, `Invalid action. Expected: ${expectedAction}`);
    }

    // Run parallel simulation
    const results = await runParallelSimulation(parameters, targetFunctionName);

    return createResponse(200, {
      success: true,
      results,
      parallel: true
    });

  } catch (error) {
    console.error('Parallel simulation error:', error);
    return errorResponse(500, 'Simulation failed: ' + error.message);
  }
}

async function runParallelSimulation(params, targetFunctionName) {
  const numSeeds = params.numSeeds || 100;
  const numWorkers = Math.min(10, numSeeds); // Max 10 parallel workers
  const seedsPerWorker = Math.ceil(numSeeds / numWorkers);

  console.log('Starting parallel simulation:', {
    totalSeeds: numSeeds,
    numWorkers,
    seedsPerWorker,
    targetFunction: targetFunctionName
  });

  const startTime = Date.now();

  // Create worker invocations
  const workerPromises = [];
  for (let i = 0; i < numWorkers; i++) {
    const workerSeeds = Math.min(seedsPerWorker, numSeeds - (i * seedsPerWorker));

    if (workerSeeds > 0) {
      workerPromises.push(
        invokeWorker({
          ...params,
          numSeeds: workerSeeds,
          _workerIndex: i,
          _seedOffset: i * seedsPerWorker
        }, targetFunctionName, i)
      );
    }
  }

  // Run all workers in parallel
  const workerResults = await Promise.all(workerPromises);
  const duration = Date.now() - startTime;

  console.log('All workers completed:', {
    duration: `${duration}ms`,
    workers: workerResults.length
  });

  // Aggregate results - this will be simulation-specific
  // For now, return the first result and add metadata
  const aggregatedResults = workerResults[0];

  return {
    ...aggregatedResults,
    numSeeds: numSeeds,
    parallelExecution: true,
    workers: workerResults.length,
    duration: duration
  };
}

async function invokeWorker(params, targetFunctionName, workerIndex) {
  console.log(`Invoking worker ${workerIndex}:`, {
    function: targetFunctionName,
    numSeeds: params.numSeeds
  });

  try {
    // Check if running locally or in Lambda
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      // In Lambda - invoke target Lambda
      const lambda = new LambdaClient({
        region: process.env.AWS_REGION || 'us-east-2'
      });

      const command = new InvokeCommand({
        FunctionName: targetFunctionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
          httpMethod: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer internal-worker-call'
          },
          body: JSON.stringify({
            action: params._action || 'runSimulation',
            parameters: params
          })
        })
      });

      const response = await lambda.send(command);
      const payload = JSON.parse(new TextDecoder().decode(response.Payload));

      if (payload.statusCode === 200) {
        const body = JSON.parse(payload.body);
        return body.results;
      } else {
        throw new Error(`Worker ${workerIndex} failed: ${payload.body}`);
      }
    } else {
      // Running locally - call the target function directly (for testing)
      console.log(`Worker ${workerIndex}: Running locally, would invoke ${targetFunctionName}`);

      // For local testing, just return mock results
      return {
        numSeeds: params.numSeeds,
        _workerIndex: workerIndex,
        message: 'Local execution - replace with actual simulation call'
      };
    }
  } catch (error) {
    console.error(`Worker ${workerIndex} error:`, error);
    throw error;
  }
}

export { runParallelSimulation, invokeWorker };
