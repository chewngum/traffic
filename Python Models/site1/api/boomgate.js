/**
 * /api/boomgate.js
 *
 * BOOM GATE QUEUING SIMULATION - BACKEND API
 * ==========================================
 *
 * This module simulates a single-server queuing system (M/G/1 queue) for boom gate operations.
 * It models vehicle arrivals, service times, queue formation, and system performance metrics.
 *
 * KEY FEATURES:
 * - Supports both exponential and deterministic service time distributions
 * - Implements minimum headway constraints for realistic traffic flow
 * - Memory-optimized design using event counters instead of storing all events
 * - Multiple simulation execution modes for timing estimation and progress tracking
 * - Seed-based random number generation for reproducible results
 *
 * SIMULATION ARCHITECTURE:
 * - Single server (boom gate) processing arriving vehicles
 * - Queue formation when server is busy
 * - Tracks system state (number of vehicles in system) over time
 * - Calculates waiting times, utilization, and queue length distributions
 */

/**
 * Generate a random value from an exponential distribution
 *
 * MATHEMATICAL BACKGROUND:
 * Uses the inverse transform method: if U ~ Uniform(0,1), then -ln(1-U)/λ ~ Exponential(λ)
 * This generates inter-arrival times or service times following exponential distribution
 *
 * @param {number} rate - The rate parameter (λ) of the exponential distribution (events per time unit)
 * @param {function} random - Random number generator function (defaults to Math.random)
 * @returns {number} A random value from the exponential distribution
 */
function exponentialRandom(rate, random = Math.random) {
    return -Math.log(1 - random()) / rate;
}

/**
 * Calculate the adjusted arrival rate to account for minimum headway constraints
 *
 * PROBLEM STATEMENT:
 * When vehicles have a minimum following distance (headway), raw exponential inter-arrival
 * times must be adjusted. This function finds the exponential rate parameter that, after
 * applying the minimum headway constraint, produces the desired mean inter-arrival time.
 *
 * MATHEMATICAL APPROACH:
 * For a minimum headway h and exponential rate λ, the expected inter-arrival time is:
 *   E[max(Exp(λ), h)] = h + e^(-λh)/λ
 *
 * We use binary search to find λ such that this equals the target mean.
 *
 * @param {number} targetMean - Desired mean inter-arrival time (seconds)
 * @param {number} minTime - Minimum headway/following distance (seconds)
 * @returns {number} The adjusted exponential rate parameter
 */
function findAdjustedRate(targetMean, minTime) {
    // Edge case: no minimum headway constraint
    if (minTime <= 0) return 1 / targetMean;

    // Edge case: minimum headway exceeds or equals target mean
    if (minTime >= targetMean) return 1 / minTime;

    // Binary search bounds for the rate parameter
    let lowRate = 0.0001;        // Lower bound (near zero but positive)
    let highRate = 1 / minTime;  // Upper bound (rate for mean = minTime)
    let tolerance = 0.0001;      // Convergence tolerance

    // Binary search iteration (max 100 iterations for convergence)
    for (let i = 0; i < 100; i++) {
        let testRate = (lowRate + highRate) / 2;

        // Calculate expected mean with this rate and minimum headway constraint
        let expectedMean = minTime + Math.exp(-testRate * minTime) / testRate;

        // Check if we've converged to the target mean
        if (Math.abs(expectedMean - targetMean) < tolerance) {
            return testRate;
        }

        // Adjust search bounds based on whether expected mean is too high or too low
        if (expectedMean > targetMean) {
            lowRate = testRate;  // Rate too low, need higher rate (shorter times)
        } else {
            highRate = testRate; // Rate too high, need lower rate (longer times)
        }
    }

    // Return best estimate after max iterations
    return (lowRate + highRate) / 2;
}

/**
 * Generate a service time based on the specified distribution
 *
 * SERVICE TIME MODELS:
 * - Exponential: Models highly variable service times (M/M/1 queue)
 *   Realistic for scenarios with human operators or unpredictable conditions
 * - Deterministic: Models constant service times (M/D/1 queue)
 *   Realistic for automated systems with consistent operation times
 *
 * @param {number} mean - Mean service time (seconds)
 * @param {boolean} isExponential - True for exponential distribution, false for deterministic
 * @param {function} random - Random number generator function
 * @returns {number} Generated service time (seconds)
 */
function generateServiceTime(mean, isExponential, random = Math.random) {
    // Handle zero service time (instantaneous service)
    if (mean <= 0) {
        return 0;
    }

    if (isExponential) {
        // Generate from exponential distribution with rate = 1/mean
        return exponentialRandom(1 / mean, random);
    } else {
        // Return constant deterministic service time
        return mean;
    }
}

/**
 * Create a seeded pseudo-random number generator
 *
 * REPRODUCIBILITY:
 * Uses a Linear Congruential Generator (LCG) algorithm for deterministic random sequences.
 * Same seed always produces the same sequence of random numbers, enabling:
 * - Reproducible simulation results
 * - Debugging and validation
 * - Comparison of scenarios with controlled randomness
 *
 * LCG PARAMETERS:
 * - Multiplier: 9301
 * - Increment: 49297
 * - Modulus: 233280
 * These values are chosen to provide good statistical properties
 *
 * @param {number} seed - Initial seed value for the random number generator
 * @returns {function} A random number generator function that returns values in [0, 1)
 */
function createSeededRandom(seed) {
    let state = seed;
    return function() {
        // LCG formula: state = (a * state + c) mod m
        state = (state * 9301 + 49297) % 233280;
        // Normalize to [0, 1) range
        return state / 233280;
    };
}

/**
 * Run a single replication of the boom gate simulation
 *
 * MEMORY OPTIMIZATION:
 * This implementation uses event counters and accumulators instead of storing
 * individual event records, reducing memory from O(n) to O(1) where n is the
 * number of vehicles. This enables simulation of millions of arrivals.
 *
 * SIMULATION METHODOLOGY:
 * 1. Generate vehicle arrivals with exponential inter-arrival times
 * 2. Apply minimum headway constraints to arrivals
 * 3. Calculate service times (exponential or deterministic)
 * 4. Track waiting times and queue lengths
 * 5. Compute performance metrics (utilization, average wait, probability of waiting)
 *
 * METRICS COLLECTED:
 * - Customer counts and arrival rates
 * - Server utilization (fraction of time busy)
 * - Average waiting times (for all customers and for customers who waited)
 * - Probability of waiting
 * - Queue length distribution (system state percentages)
 * - Hourly maximum queue lengths
 *
 * @param {object} params - Simulation parameters
 * @param {number} params.simulationHours - Duration of simulation (hours)
 * @param {number} params.arrivalRate - Mean arrival rate (vehicles per hour)
 * @param {number} params.minHeadway - Minimum time between arrivals (seconds)
 * @param {number} params.servicePart1 - Mean time for first service component (seconds)
 * @param {number} params.servicePart2 - Mean time for second service component (seconds)
 * @param {boolean} params.part1IsExp - Whether part 1 follows exponential distribution
 * @param {boolean} params.part2IsExp - Whether part 2 follows exponential distribution
 * @param {number|null} seedValue - Random seed (null for non-deterministic)
 * @returns {object} Simulation results with all performance metrics
 */
function runSingleSimulation(params, seedValue = null) {
    // Initialize random number generator (seeded for reproducibility or random)
    const random = seedValue !== null ? createSeededRandom(seedValue) : Math.random;

    const simulationTime = params.simulationHours * 3600; // Convert hours to seconds
    let constrainedArrivals = 0;  // Count of arrivals constrained by minimum headway
    let totalCustomers = 0;        // Total number of vehicles processed

    // MEMORY-OPTIMIZED ACCUMULATORS (instead of storing individual event data)
    let totalWaitingTime = 0;              // Sum of all waiting times
    let totalWaitingTimeForWaiters = 0;    // Sum of waiting times for vehicles that waited
    let customersWhoWaited = 0;            // Count of vehicles that experienced waiting
    let totalServiceTime = 0;              // Sum of all service times
    let serverFreeTime = 0;                // Time when server becomes available

    // SYSTEM STATE TRACKING (for queue length distribution)
    let systemState = 0;              // Current number of vehicles in system (queue + service)
    let lastEventTime = 0;            // Time of last state change event
    let stateTimeAccumulator = {};    // Total time spent in each system state
    let hourlyMaximums = new Array(params.simulationHours).fill(0);  // Max queue per hour
    let maxStateObserved = 0;         // Highest system state reached during simulation

    // Initialize accumulator for empty system state
    stateTimeAccumulator[0] = 0;

    // EDGE CASE: Handle zero arrival rate (no traffic scenario)
    if (params.arrivalRate <= 0) {
        return {
            totalCustomers: 0,
            avgArrivalsPerHour: 0,
            serverUtilization: 0,
            avgWaitTimePerArrival: 0,
            avgWaitTimePerWaiter: 0,
            probabilityOfWaiting: 0,
            systemStatePercentages: {0: 100},  // System always empty
            hourlyMaxDistribution: {0: 100},   // Max queue always 0
            constrainedArrivals: 0,
            avgServiceTime: 0
        };
    }

    // Convert arrival rate from vehicles/hour to vehicles/second
    const arrivalRate = params.arrivalRate / 3600;
    const targetInterArrivalTime = 1 / arrivalRate;
    const minHeadway = params.minHeadway;

    // Calculate adjusted exponential rate to account for minimum headway constraint
    const adjustedRate = findAdjustedRate(targetInterArrivalTime, minHeadway);

    /**
     * MIN-HEAP DATA STRUCTURE FOR DEPARTURE EVENTS
     *
     * We use a min-heap to efficiently manage departure (service completion) events.
     * This allows O(log n) insertion and O(log n) extraction of the earliest departure.
     * The heap stores departure times, and we process them chronologically as we
     * generate arrivals, maintaining proper event ordering without storing all events.
     */
    const departureHeap = [];

    /**
     * Insert a departure time into the min-heap
     * Maintains heap property: parent <= children
     */
    function heapPush(heap, time) {
        heap.push(time);
        let i = heap.length - 1;
        // Bubble up: swap with parent if current element is smaller
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (heap[parent] <= heap[i]) break;
            [heap[parent], heap[i]] = [heap[i], heap[parent]];
            i = parent;
        }
    }

    /**
     * Extract the minimum (earliest) departure time from the heap
     * Restores heap property after removal
     */
    function heapPop(heap) {
        if (heap.length === 0) return null;
        if (heap.length === 1) return heap.pop();

        const result = heap[0];  // Store minimum element
        heap[0] = heap.pop();    // Move last element to root

        // Bubble down: swap with smallest child until heap property restored
        let i = 0;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < heap.length && heap[left] < heap[smallest]) smallest = left;
            if (right < heap.length && heap[right] < heap[smallest]) smallest = right;
            if (smallest === i) break;
            [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
            i = smallest;
        }
        return result;
    }

    /**
     * Update the system state when an arrival or departure occurs
     *
     * SYSTEM STATE TRACKING:
     * System state = number of vehicles in the system (queue + being served)
     * We track the total time spent in each state to compute the queue length distribution
     *
     * @param {number} newTime - Time of the state change event
     * @param {number} delta - Change in system state (+1 for arrival, -1 for departure)
     */
    function updateSystemState(newTime, delta) {
        // Accumulate time spent in current state before transitioning
        const timeDiff = newTime - lastEventTime;
        if (timeDiff > 0) {
            stateTimeAccumulator[systemState] = (stateTimeAccumulator[systemState] || 0) + timeDiff;

            // Track maximum queue length observed in each hour (for hourly max distribution)
            const currentHour = Math.floor(lastEventTime / 3600);
            if (currentHour < params.simulationHours) {
                hourlyMaximums[currentHour] = Math.max(hourlyMaximums[currentHour], systemState);
            }
        }

        // Transition to new state
        systemState += delta;
        maxStateObserved = Math.max(maxStateObserved, systemState);
        lastEventTime = newTime;

        // Initialize accumulator for new state if this is the first time visiting it
        if (!(systemState in stateTimeAccumulator)) {
            stateTimeAccumulator[systemState] = 0;
        }
    }

    /**
     * MAIN SIMULATION LOOP
     *
     * ALGORITHM:
     * 1. Generate arrivals sequentially with exponential inter-arrival times
     * 2. Apply minimum headway constraint to each inter-arrival time
     * 3. Process any departures that occur before the next arrival
     * 4. Calculate waiting time and service time for the arriving vehicle
     * 5. Schedule departure and update system state
     * 6. Repeat until simulation time is reached
     *
     * EFFICIENCY:
     * By generating arrivals on-the-fly and using a heap for departures,
     * we avoid storing all events in memory. Only active vehicles (in queue
     * or being served) are tracked via the heap.
     */
    let currentTime = 0;

    while (currentTime < simulationTime) {
        // STEP 1: Generate next arrival with exponential inter-arrival time
        const rawInterArrival = exponentialRandom(adjustedRate, random);

        // STEP 2: Apply minimum headway constraint (safety/physical spacing requirement)
        const actualInterArrival = Math.max(rawInterArrival, minHeadway);

        // Track how many arrivals were constrained by minimum headway
        if (rawInterArrival < minHeadway) {
            constrainedArrivals++;
        }

        // Advance simulation clock to next arrival time
        currentTime += actualInterArrival;
        if (currentTime >= simulationTime) break;  // Stop if we've exceeded simulation time

        // STEP 3: Process all departures that occur before this arrival
        // This maintains chronological event ordering
        while (departureHeap.length > 0 && departureHeap[0] <= currentTime) {
            const departureTime = heapPop(departureHeap);
            updateSystemState(departureTime, -1);  // Decrement system state
        }

        // STEP 4: Process the arrival
        totalCustomers++;

        // Generate service time (two-component service: e.g., gate opening + passing through)
        const part1Time = generateServiceTime(params.servicePart1, params.part1IsExp, random);
        const part2Time = generateServiceTime(params.servicePart2, params.part2IsExp, random);
        const serviceTime = part1Time + part2Time;
        totalServiceTime += serviceTime;

        // STEP 5: Calculate waiting time and service completion time
        // Service starts either immediately (if server free) or when server becomes available
        const serviceStartTime = Math.max(currentTime, serverFreeTime);
        const waitingTime = serviceStartTime - currentTime;
        const departureTime = serviceStartTime + serviceTime;

        // Accumulate waiting time statistics (memory-efficient: no array storage)
        totalWaitingTime += waitingTime;
        if (waitingTime > 0.001) {  // Tolerance for numerical precision
            totalWaitingTimeForWaiters += waitingTime;
            customersWhoWaited++;
        }

        // STEP 6: Update system state for this arrival
        updateSystemState(currentTime, 1);  // Increment system state

        // STEP 7: Schedule departure (service completion) in heap
        heapPush(departureHeap, departureTime);
        serverFreeTime = departureTime;  // Update when server will next be free
    }

    /**
     * CLEANUP PHASE: Process remaining departures after simulation time
     *
     * Some vehicles may still be in the system when simulation ends.
     * We process their departures (capped at simulation end time) to
     * correctly account for final system state and time-in-state statistics.
     */
    while (departureHeap.length > 0) {
        let departureTime = heapPop(departureHeap);
        // Cap departure time at simulation end (for state tracking purposes)
        if (departureTime > simulationTime) {
            departureTime = simulationTime;
        }
        updateSystemState(departureTime, -1);
    }

    // Final state update: accumulate time from last event to simulation end
    if (lastEventTime < simulationTime) {
        const timeDiff = simulationTime - lastEventTime;
        stateTimeAccumulator[systemState] = (stateTimeAccumulator[systemState] || 0) + timeDiff;

        // Update hourly maximum for the final hour
        const currentHour = Math.floor(lastEventTime / 3600);
        if (currentHour < params.simulationHours) {
            hourlyMaximums[currentHour] = Math.max(hourlyMaximums[currentHour], systemState);
        }
    }

    /**
     * CALCULATE FINAL PERFORMANCE METRICS
     *
     * METRICS DEFINITIONS:
     * - Arrival Rate: Average vehicles per hour over simulation period
     * - Server Utilization: Fraction of time server was busy (ρ = λ/μ in queueing theory)
     * - Average Wait (all): Mean waiting time across all vehicles (including those with zero wait)
     * - Average Wait (waiters): Mean waiting time for only those vehicles that had to wait
     * - Probability of Waiting: Fraction of vehicles that experienced non-zero wait time
     * - Average Service Time: Mean time vehicles spent being served
     */
    const avgArrivalsPerHour = totalCustomers / params.simulationHours;
    const serverUtilization = totalServiceTime / simulationTime;
    const avgWaitTimePerArrival = totalCustomers > 0 ? totalWaitingTime / totalCustomers : 0;
    const avgWaitTimePerWaiter = customersWhoWaited > 0 ? totalWaitingTimeForWaiters / customersWhoWaited : 0;
    const probabilityOfWaiting = totalCustomers > 0 ? customersWhoWaited / totalCustomers : 0;
    const avgServiceTime = totalCustomers > 0 ? totalServiceTime / totalCustomers : 0;

    /**
     * QUEUE LENGTH DISTRIBUTION (System State Percentages)
     *
     * Convert accumulated time in each state to percentages.
     * State n means n vehicles in system (queue + service).
     * This distribution shows the long-run probability of observing each queue length.
     */
    let systemStatePercentages = {};
    for (let state = 0; state <= maxStateObserved; state++) {
        const timeInState = stateTimeAccumulator[state] || 0;
        systemStatePercentages[state] = (timeInState / simulationTime) * 100;
    }

    /**
     * HOURLY MAXIMUM DISTRIBUTION
     *
     * Distribution of the maximum queue length observed in each hour.
     * Useful for capacity planning and understanding peak load behavior.
     * Shows what percentage of hours experienced each maximum queue length.
     */
    let hourlyMaxDistribution = {};
    for (let max of hourlyMaximums) {
        hourlyMaxDistribution[max] = (hourlyMaxDistribution[max] || 0) + 1;
    }

    // Convert counts to percentages
    for (let max in hourlyMaxDistribution) {
        hourlyMaxDistribution[max] = (hourlyMaxDistribution[max] / params.simulationHours) * 100;
    }

    // Return comprehensive simulation results
    return {
        totalCustomers,
        avgArrivalsPerHour,
        serverUtilization,
        avgWaitTimePerArrival,
        avgWaitTimePerWaiter,
        probabilityOfWaiting,
        systemStatePercentages,
        hourlyMaxDistribution,
        constrainedArrivals,
        avgServiceTime
    };
}

/**
 * Calculate statistical summary (average, min, max) from an array of values
 *
 * Used to aggregate results across multiple simulation replications,
 * providing point estimates and variability ranges.
 *
 * @param {number[]} values - Array of numeric values
 * @returns {object} Statistics object with avg, min, max properties
 */
function calcStats(values) {
    if (values.length === 0) return { avg: 0, min: 0, max: 0 };
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { avg, min, max };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * API HANDLER - Main entry point for boom gate simulation requests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EXECUTION MODES:
 * 1. 'runSimulation' - Single-call execution (backwards compatible)
 * 2. 'getFirstTwoSeedsTiming' - Run first 2 seeds for time estimation
 * 3. 'runRemainingSeeds' - Complete remaining seeds after timing estimation
 * 4. 'runSimulationBatched' - Run in batches with progress tracking
 *
 * The multi-step approach (modes 2-3) enables:
 * - Accurate progress estimation based on actual performance
 * - Better user experience with real-time feedback
 * - Ability to cancel long-running simulations
 *
 * @param {object} req - HTTP request object
 * @param {object} res - HTTP response object
 */
export default function handler(req, res) {
    // ═══════════════════════════════════════════════════════════════════════
    // CORS HEADERS - Allow cross-origin requests from frontend
    // ═══════════════════════════════════════════════════════════════════════
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Authentication is handled upstream by Lambda wrapper (simulation-wrapper.js)
        const { action, parameters } = req.body;

        // ═══════════════════════════════════════════════════════════════════════
        // ACTION: runSimulationBatched
        // ═══════════════════════════════════════════════════════════════════════
        // Executes simulation in batches of 5 seeds with real-time progress tracking
        //
        // BATCH PROCESSING STRATEGY:
        // - Process seeds in groups of 5 to provide granular progress updates
        // - Track timing per batch to calculate rolling average execution time
        // - Estimate remaining time dynamically based on recent performance
        // - Enables responsive UI with progress bars and time estimates
        //
        // PERFORMANCE OPTIMIZATION:
        // - Rolling window of last 5 batch timings for adaptive time estimation
        // - Accounts for JIT compilation warm-up and system load variations
        // - More accurate than single-seed timing extrapolation
        // ═══════════════════════════════════════════════════════════════════════
        if (action === 'runSimulationBatched') {
            console.log(`Starting batched simulation with ${parameters.numSeeds} seeds...`);
            const startTime = Date.now();

            // Result accumulators
            let results = [];              // Individual seed results
            let allSystemStates = {};      // System state data from all seeds
            let allHourlyMax = {};         // Hourly maximum data from all seeds
            let seedTimings = [];          // Rolling window of batch execution times

            /**
             * Collect and aggregate data from a single seed result
             * Accumulates system state and hourly max distributions across all seeds
             */
            function collectSeedData(result) {
                results.push(result);

                // Aggregate system state percentages across seeds
                for (let state in result.systemStatePercentages) {
                    if (!allSystemStates[state]) allSystemStates[state] = [];
                    allSystemStates[state].push(result.systemStatePercentages[state]);
                }

                // Aggregate hourly maximum distributions across seeds
                for (let max in result.hourlyMaxDistribution) {
                    if (!allHourlyMax[max]) allHourlyMax[max] = [];
                    allHourlyMax[max].push(result.hourlyMaxDistribution[max]);
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // BATCH EXECUTION LOOP
            // Process seeds in batches of 5, tracking timing for each batch
            // ═══════════════════════════════════════════════════════════════
            for (let batchStart = 0; batchStart < parameters.numSeeds; batchStart += 5) {
                const batchEnd = Math.min(batchStart + 5, parameters.numSeeds);
                const batchStartTime = Date.now();

                // Execute all seeds in this batch
                for (let seed = batchStart; seed < batchEnd; seed++) {
                    // Determine seed value based on seed mode
                    let seedValue = null;
                    if (parameters.seedMode === 'fixed') {
                        seedValue = seed * 12345;  // Deterministic seed sequence
                    } else {
                        seedValue = Math.floor(Math.random() * 1000000);  // Random seed
                    }

                    const result = runSingleSimulation(parameters, seedValue);
                    collectSeedData(result);
                }

                // Calculate batch timing statistics
                const batchTime = Date.now() - batchStartTime;
                const seedsInBatch = batchEnd - batchStart;
                const avgTimePerSeed = batchTime / seedsInBatch;

                // Update rolling average (keep last 5 batch timings for adaptive estimation)
                seedTimings.push(avgTimePerSeed);
                if (seedTimings.length > 5) {
                    seedTimings.shift();  // Remove oldest timing to maintain window size
                }

                // Calculate performance metrics for progress estimation
                const rollingAvg = seedTimings.reduce((sum, time) => sum + time, 0) / seedTimings.length;
                const completedSeeds = batchEnd;
                const progress = (completedSeeds / parameters.numSeeds) * 100;
                const remainingSeeds = parameters.numSeeds - completedSeeds;
                const estimatedRemainingTime = remainingSeeds * rollingAvg + 500; // +500ms buffer for averaging phase

                console.log(`Batch ${Math.ceil(batchEnd/5)}: ${completedSeeds}/${parameters.numSeeds} seeds (${progress.toFixed(1)}%) - Rolling avg: ${rollingAvg.toFixed(0)}ms/seed`);

                // NOTE: In a streaming/WebSocket setup, progress would be sent here
                // Current implementation returns all results at once for simplicity
            }

            // ═══════════════════════════════════════════════════════════════
            // AGGREGATION PHASE
            // Calculate average, min, max statistics across all seed results
            // ═══════════════════════════════════════════════════════════════
            console.log('Starting averaging calculations...');
            const averagingStart = Date.now();

            // Aggregate scalar performance metrics
            const avgResults = {};
            const metrics = ['totalCustomers', 'avgArrivalsPerHour', 'serverUtilization',
                           'avgWaitTimePerArrival', 'avgWaitTimePerWaiter', 'probabilityOfWaiting'];

            for (let metric of metrics) {
                const values = results.map(r => r[metric]);
                avgResults[metric] = calcStats(values);  // {avg, min, max}
            }

            // Aggregate system state distribution
            let avgSystemStates = {};
            for (let state in allSystemStates) {
                avgSystemStates[state] = calcStats(allSystemStates[state]);
            }

            // Aggregate hourly maximum distribution
            let avgHourlyMax = {};
            for (let max in allHourlyMax) {
                avgHourlyMax[max] = calcStats(allHourlyMax[max]);
            }

            const averagingTime = Date.now() - averagingStart;
            const totalTime = Date.now() - startTime;

            console.log(`Batched simulation completed in ${totalTime}ms`);

            // Construct response with aggregated results
            const finalResults = {
                numSeeds: parameters.numSeeds,
                avgArrivalsPerHour: avgResults.avgArrivalsPerHour.avg,
                serverUtilization: avgResults.serverUtilization.avg,
                totalCustomers: avgResults.totalCustomers,
                avgWaitTimePerArrival: avgResults.avgWaitTimePerArrival,
                avgWaitTimePerWaiter: avgResults.avgWaitTimePerWaiter,
                probabilityOfWaiting: avgResults.probabilityOfWaiting,
                systemStatePercentages: avgSystemStates,
                hourlyMaxDistribution: avgHourlyMax
            };

            return res.status(200).json({
                success: true,
                results: finalResults,
                executionTimeMs: totalTime,
                averagingTimeMs: averagingTime,
                finalAvgTimePerSeed: seedTimings[seedTimings.length - 1] || 0
            });

        // ═══════════════════════════════════════════════════════════════════════
        // ACTION: getFirstTwoSeedsTiming
        // ═══════════════════════════════════════════════════════════════════════
        // Runs the first two simulation seeds to establish baseline timing
        //
        // TWO-SEED STRATEGY:
        // - First seed: Warm-up run to trigger JIT compilation
        // - Second seed: Measured run for accurate timing estimation
        // - Avoids overestimating time due to cold-start penalties
        //
        // PURPOSE:
        // - Provides early time estimate to the UI
        // - Enables user-informed decisions about simulation size
        // - First seed "primes" the JavaScript engine for optimal performance
        // - Second seed timing is more representative of steady-state performance
        //
        // WORKFLOW:
        // 1. Client calls getFirstTwoSeedsTiming
        // 2. Client displays estimated time to user
        // 3. Client calls runRemainingSeeds to complete simulation
        // ═══════════════════════════════════════════════════════════════════════
        } else if (action === 'getFirstTwoSeedsTiming') {
            console.log('Running first two seeds for timing estimation...');
            const firstTwoSeedsStart = Date.now();

            // FIRST SEED: Warm-up run (triggers JIT compilation)
            let firstSeedValue = null;
            if (parameters.seedMode === 'fixed') {
                firstSeedValue = 0 * 12345;  // Deterministic first seed
            } else {
                firstSeedValue = Math.floor(Math.random() * 1000000);  // Random first seed
            }

            const firstSeedResult = runSingleSimulation(parameters, firstSeedValue);

            // SECOND SEED: Measured run for accurate timing
            const secondSeedStart = Date.now();
            let secondSeedValue = null;
            if (parameters.seedMode === 'fixed') {
                secondSeedValue = 1 * 12345;  // Deterministic second seed
            } else {
                secondSeedValue = Math.floor(Math.random() * 1000000);  // Random second seed
            }

            const secondSeedResult = runSingleSimulation(parameters, secondSeedValue);
            const secondSeedTime = Date.now() - secondSeedStart;

            // ESTIMATE TOTAL TIME: Based on second seed performance
            const remainingSeeds = parameters.numSeeds - 2;
            const averagingTime = 500;  // Estimated time for result aggregation (ms)
            const estimatedTotalTime = (Date.now() - firstTwoSeedsStart) +
                                      (remainingSeeds * secondSeedTime) +
                                      averagingTime;

            console.log(`First two seeds completed. Second seed took ${secondSeedTime}ms. Estimated total: ${estimatedTotalTime}ms`);

            return res.status(200).json({
                success: true,
                secondSeedTime: secondSeedTime,
                estimatedTotalTime: estimatedTotalTime,
                firstSeedResult: firstSeedResult,
                secondSeedResult: secondSeedResult,
                seedsCompleted: 2
            });

        // ═══════════════════════════════════════════════════════════════════════
        // ACTION: runRemainingSeeds
        // ═══════════════════════════════════════════════════════════════════════
        // Completes simulation by running remaining seeds after timing estimation
        //
        // This is the second phase of the two-step execution workflow:
        // - Receives results from first two seeds (already completed)
        // - Executes remaining seeds (seed 3 through numSeeds)
        // - Aggregates all results and returns final statistics
        //
        // BENEFITS:
        // - User can cancel before committing to full simulation
        // - More responsive UX with early time feedback
        // - Preserves all seed results for proper aggregation
        // ═══════════════════════════════════════════════════════════════════════
        } else if (action === 'runRemainingSeeds') {
            const remainingCount = parameters.numSeeds - (parameters.seedsCompleted || 0);
            console.log(`Running remaining ${remainingCount} seeds...`);
            const remainingSeedsStart = Date.now();
            
            let results = [];
            let allSystemStates = {};
            let allHourlyMax = {};
            
            // Add the first two seed results if provided
            if (parameters.firstSeedResult) {
                results.push(parameters.firstSeedResult);
                
                // Collect first seed data
                for (let state in parameters.firstSeedResult.systemStatePercentages) {
                    if (!allSystemStates[state]) allSystemStates[state] = [];
                    allSystemStates[state].push(parameters.firstSeedResult.systemStatePercentages[state]);
                }
                
                for (let max in parameters.firstSeedResult.hourlyMaxDistribution) {
                    if (!allHourlyMax[max]) allHourlyMax[max] = [];
                    allHourlyMax[max].push(parameters.firstSeedResult.hourlyMaxDistribution[max]);
                }
            }
            
            if (parameters.secondSeedResult) {
                results.push(parameters.secondSeedResult);
                
                // Collect second seed data
                for (let state in parameters.secondSeedResult.systemStatePercentages) {
                    if (!allSystemStates[state]) allSystemStates[state] = [];
                    allSystemStates[state].push(parameters.secondSeedResult.systemStatePercentages[state]);
                }
                
                for (let max in parameters.secondSeedResult.hourlyMaxDistribution) {
                    if (!allHourlyMax[max]) allHourlyMax[max] = [];
                    allHourlyMax[max].push(parameters.secondSeedResult.hourlyMaxDistribution[max]);
                }
            }
            
            // Run remaining seeds (starting from seed 3)
            const startingSeed = parameters.seedsCompleted || 2;
            for (let seed = startingSeed; seed < parameters.numSeeds; seed++) {
                // Determine seed value based on mode
                let seedValue = null;
                if (parameters.seedMode === 'fixed') {
                    seedValue = seed * 12345; // Deterministic seeds
                } else {
                    seedValue = Math.floor(Math.random() * 1000000); // Random seeds
                }
                
                const result = runSingleSimulation(parameters, seedValue);
                results.push(result);
                
                // Collect system state data
                for (let state in result.systemStatePercentages) {
                    if (!allSystemStates[state]) allSystemStates[state] = [];
                    allSystemStates[state].push(result.systemStatePercentages[state]);
                }
                
                // Collect hourly max data
                for (let max in result.hourlyMaxDistribution) {
                    if (!allHourlyMax[max]) allHourlyMax[max] = [];
                    allHourlyMax[max].push(result.hourlyMaxDistribution[max]);
                }
            }
            
            console.log('Starting averaging calculations...');
            const averagingStart = Date.now();
            
            // Calculate averages and ranges
            const avgResults = {};
            const metrics = ['totalCustomers', 'avgArrivalsPerHour', 'serverUtilization', 
                           'avgWaitTimePerArrival', 'avgWaitTimePerWaiter', 'probabilityOfWaiting'];
            
            for (let metric of metrics) {
                const values = results.map(r => r[metric]);
                avgResults[metric] = calcStats(values);
            }
            
            // Average system states
            let avgSystemStates = {};
            for (let state in allSystemStates) {
                avgSystemStates[state] = calcStats(allSystemStates[state]);
            }
            
            // Average hourly max
            let avgHourlyMax = {};
            for (let max in allHourlyMax) {
                avgHourlyMax[max] = calcStats(allHourlyMax[max]);
            }
            
            const averagingTime = Date.now() - averagingStart;
            const totalTime = Date.now() - remainingSeedsStart + (parameters.firstSeedTime || 0);
            
            console.log(`Averaging completed in ${averagingTime}ms. Total simulation time: ${totalTime}ms`);
            
            const finalResults = {
                numSeeds: parameters.numSeeds,
                avgArrivalsPerHour: avgResults.avgArrivalsPerHour.avg,
                serverUtilization: avgResults.serverUtilization.avg,
                totalCustomers: avgResults.totalCustomers,
                avgWaitTimePerArrival: avgResults.avgWaitTimePerArrival,
                avgWaitTimePerWaiter: avgResults.avgWaitTimePerWaiter,
                probabilityOfWaiting: avgResults.probabilityOfWaiting,
                systemStatePercentages: avgSystemStates,
                hourlyMaxDistribution: avgHourlyMax
            };
            
            return res.status(200).json({
                success: true,
                results: finalResults,
                executionTimeMs: totalTime,
                averagingTimeMs: averagingTime
            });

        // ═══════════════════════════════════════════════════════════════════════
        // ACTION: runSimulation
        // ═══════════════════════════════════════════════════════════════════════
        // Legacy single-call simulation execution (backwards compatibility)
        //
        // This is the original implementation that runs all seeds in one request.
        // Simpler but provides less user feedback during long-running simulations.
        //
        // DIFFERENCES FROM BATCHED/TWO-STEP:
        // - No progress updates during execution
        // - Returns timing estimate AFTER first seed (not predictive)
        // - Single HTTP request/response cycle
        // - Easier for simple clients without progress UI
        // ═══════════════════════════════════════════════════════════════════════
        } else if (action === 'runSimulation') {
            console.log(`Starting boom gate simulation with ${parameters.numSeeds} seeds...`);
            const startTime = Date.now();
            
            // Run first seed and measure timing
            const firstSeedStart = Date.now();
            let seedValue = parameters.seedMode === 'fixed' ? 0 * 12345 : Math.floor(Math.random() * 1000000);
            const firstSeedResult = runSingleSimulation(parameters, seedValue);
            const firstSeedTime = Date.now() - firstSeedStart;
            
            let results = [firstSeedResult];
            let allSystemStates = {};
            let allHourlyMax = {};
            
            // Collect first seed data
            for (let state in firstSeedResult.systemStatePercentages) {
                if (!allSystemStates[state]) allSystemStates[state] = [];
                allSystemStates[state].push(firstSeedResult.systemStatePercentages[state]);
            }
            
            for (let max in firstSeedResult.hourlyMaxDistribution) {
                if (!allHourlyMax[max]) allHourlyMax[max] = [];
                allHourlyMax[max].push(firstSeedResult.hourlyMaxDistribution[max]);
            }
            
            // Run remaining seeds
            for (let seed = 1; seed < parameters.numSeeds; seed++) {
                seedValue = parameters.seedMode === 'fixed' ? seed * 12345 : Math.floor(Math.random() * 1000000);
                
                const result = runSingleSimulation(parameters, seedValue);
                results.push(result);
                
                // Collect system state data
                for (let state in result.systemStatePercentages) {
                    if (!allSystemStates[state]) allSystemStates[state] = [];
                    allSystemStates[state].push(result.systemStatePercentages[state]);
                }
                
                // Collect hourly max data
                for (let max in result.hourlyMaxDistribution) {
                    if (!allHourlyMax[max]) allHourlyMax[max] = [];
                    allHourlyMax[max].push(result.hourlyMaxDistribution[max]);
                }
            }
            
            // Calculate averages
            const avgResults = {};
            const metrics = ['totalCustomers', 'avgArrivalsPerHour', 'serverUtilization', 
                           'avgWaitTimePerArrival', 'avgWaitTimePerWaiter', 'probabilityOfWaiting'];
            
            for (let metric of metrics) {
                const values = results.map(r => r[metric]);
                avgResults[metric] = calcStats(values);
            }
            
            let avgSystemStates = {};
            for (let state in allSystemStates) {
                avgSystemStates[state] = calcStats(allSystemStates[state]);
            }
            
            let avgHourlyMax = {};
            for (let max in allHourlyMax) {
                avgHourlyMax[max] = calcStats(allHourlyMax[max]);
            }
            
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            console.log(`Boom gate simulation completed in ${totalTime}ms (first seed: ${firstSeedTime}ms)`);

            const finalResults = {
                numSeeds: parameters.numSeeds,
                avgArrivalsPerHour: avgResults.avgArrivalsPerHour.avg,
                serverUtilization: avgResults.serverUtilization.avg,
                totalCustomers: avgResults.totalCustomers,
                avgWaitTimePerArrival: avgResults.avgWaitTimePerArrival,
                avgWaitTimePerWaiter: avgResults.avgWaitTimePerWaiter,
                probabilityOfWaiting: avgResults.probabilityOfWaiting,
                systemStatePercentages: avgSystemStates,
                hourlyMaxDistribution: avgHourlyMax
            };

            return res.status(200).json({
                success: true,
                results: finalResults,
                executionTimeMs: totalTime,
                firstSeedTimeMs: firstSeedTime,
                estimatedTotalTime: firstSeedTime * parameters.numSeeds + 500
            });

        } else {
            // Unknown action requested
            return res.status(400).json({ error: 'Invalid action specified' });
        }

    } catch (error) {
        // ═══════════════════════════════════════════════════════════════════════
        // ERROR HANDLING
        // Log detailed error for debugging, return user-friendly message
        // ═══════════════════════════════════════════════════════════════════════
        console.error('Boom gate simulation error:', error);
        return res.status(500).json({
            error: 'Internal server error during simulation',
            details: error.message
        });
    }
}