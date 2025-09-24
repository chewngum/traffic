// /api/boomgate.js
// Boom Gate Simulation Backend API for Vercel with First Seed Timing

// Authentication validation (using atob instead of Buffer for browser compatibility)
function isValidToken(token) {
    try {
        const decoded = atob(token);
        const [timestamp, username, accessLevel] = decoded.split(':');
        const tokenAge = Date.now() - parseInt(timestamp);
        return tokenAge < 24 * 60 * 60 * 1000; // 24 hours
    } catch {
        return false;
    }
}

// Generate exponential random variable
function exponentialRandom(rate, random = Math.random) {
    return -Math.log(1 - random()) / rate;
}

// Find adjusted rate for minimum headway constraint
function findAdjustedRate(targetMean, minTime) {
    if (minTime <= 0) return 1 / targetMean;
    if (minTime >= targetMean) return 1 / minTime;
    
    let lowRate = 0.0001;
    let highRate = 1 / minTime;
    let tolerance = 0.0001;
    
    for (let i = 0; i < 100; i++) {
        let testRate = (lowRate + highRate) / 2;
        let expectedMean = minTime + Math.exp(-testRate * minTime) / testRate;
        
        if (Math.abs(expectedMean - targetMean) < tolerance) {
            return testRate;
        }
        
        if (expectedMean > targetMean) {
            lowRate = testRate;
        } else {
            highRate = testRate;
        }
    }
    
    return (lowRate + highRate) / 2;
}

// Generate service time based on distribution type
function generateServiceTime(mean, isExponential, random = Math.random) {
    if (mean <= 0) {
        return 0; // Handle zero service time
    }
    if (isExponential) {
        return exponentialRandom(1 / mean, random);
    } else {
        return mean; // Static/deterministic
    }
}

// Seeded random number generator
function createSeededRandom(seed) {
    let state = seed;
    return function() {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
    };
}

// Run a single simulation
function runSingleSimulation(params, seedValue = null) {
    // Create random function (seeded or normal)
    const random = seedValue !== null ? createSeededRandom(seedValue) : Math.random;
    
    const simulationTime = params.simulationHours * 3600; // in seconds
    let arrivals = [];
    let constrainedArrivals = 0;
    
    // Handle zero arrival rate case
    if (params.arrivalRate <= 0) {
        arrivals = [];
    } else {
        const arrivalRate = params.arrivalRate / 3600; // per second
        const targetInterArrivalTime = 1 / arrivalRate;
        const minHeadway = params.minHeadway;
        
        // Find adjusted rate for minimum headway
        const adjustedRate = findAdjustedRate(targetInterArrivalTime, minHeadway);
        
        // Generate arrivals
        let currentTime = 0;
        
        while (currentTime < simulationTime) {
            const rawInterArrival = exponentialRandom(adjustedRate, random);
            const actualInterArrival = Math.max(rawInterArrival, minHeadway);
            
            if (rawInterArrival < minHeadway) {
                constrainedArrivals++;
            }
            
            currentTime += actualInterArrival;
            if (currentTime < simulationTime) {
                arrivals.push(currentTime);
            }
        }
    }
    
    // Generate service times and process queue
    let events = [];
    let serverFreeTime = 0;
    let waitingTimes = [];
    let serviceTimes = [];
    
    for (let i = 0; i < arrivals.length; i++) {
        const arrivalTime = arrivals[i];
        
        // Generate two-part service time
        const part1Time = generateServiceTime(params.servicePart1, params.part1IsExp, random);
        const part2Time = generateServiceTime(params.servicePart2, params.part2IsExp, random);
        const totalServiceTime = part1Time + part2Time;
        serviceTimes.push(totalServiceTime);
        
        const serviceStartTime = Math.max(arrivalTime, serverFreeTime);
        const waitingTime = serviceStartTime - arrivalTime;
        const departureTime = serviceStartTime + totalServiceTime;
        
        events.push({type: 'arrival', time: arrivalTime});
        events.push({type: 'departure', time: departureTime});
        
        waitingTimes.push(waitingTime);
        serverFreeTime = departureTime;
    }
    
    // Sort events and track system state
    events.sort((a, b) => a.time - b.time);
    
    let systemState = 0;
    let lastEventTime = 0;
    let stateTimeAccumulator = {};
    let hourlyMaximums = new Array(params.simulationHours).fill(0);
    
    for (let i = 0; i <= arrivals.length; i++) {
        stateTimeAccumulator[i] = 0;
    }
    
    for (let event of events) {
        const timeDiff = event.time - lastEventTime;
        stateTimeAccumulator[systemState] += timeDiff;
        
        const currentHour = Math.floor(event.time / 3600);
        if (currentHour < params.simulationHours) {
            hourlyMaximums[currentHour] = Math.max(hourlyMaximums[currentHour], systemState);
        }
        
        if (event.type === 'arrival') {
            systemState++;
        } else {
            systemState--;
        }
        
        lastEventTime = event.time;
    }
    
    if (lastEventTime < simulationTime) {
        stateTimeAccumulator[systemState] += simulationTime - lastEventTime;
    }
    
    // Calculate metrics
    const totalCustomers = arrivals.length;
    const avgArrivalsPerHour = totalCustomers / params.simulationHours;
    const totalServiceTime = serviceTimes.reduce((sum, t) => sum + t, 0);
    const serverUtilization = totalServiceTime / simulationTime;
    
    const totalWaitingTime = waitingTimes.reduce((sum, w) => sum + w, 0);
    const avgWaitTimePerArrival = totalCustomers > 0 ? totalWaitingTime / totalCustomers : 0;
    
    const customersWhoWaited = waitingTimes.filter(w => w > 0.001).length;
    const avgWaitTimePerWaiter = customersWhoWaited > 0 ? 
        waitingTimes.filter(w => w > 0.001).reduce((sum, w) => sum + w, 0) / customersWhoWaited : 0;
    
    const probabilityOfWaiting = totalCustomers > 0 ? customersWhoWaited / totalCustomers : 0;
    
    // System state percentages
    let systemStatePercentages = {};
    let maxState = Math.max(...Object.keys(stateTimeAccumulator).map(k => parseInt(k)));
    
    for (let state = 0; state <= maxState; state++) {
        const timeInState = stateTimeAccumulator[state] || 0;
        systemStatePercentages[state] = (timeInState / simulationTime) * 100;
    }
    
    // Hourly maximum distribution
    let hourlyMaxDistribution = {};
    for (let max of hourlyMaximums) {
        hourlyMaxDistribution[max] = (hourlyMaxDistribution[max] || 0) + 1;
    }
    
    for (let max in hourlyMaxDistribution) {
        hourlyMaxDistribution[max] = (hourlyMaxDistribution[max] / params.simulationHours) * 100;
    }
    
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
        avgServiceTime: totalCustomers > 0 ? totalServiceTime / totalCustomers : 0
    };
}

// Calculate statistics (average, min, max) from array of values
function calcStats(values) {
    if (values.length === 0) return { avg: 0, min: 0, max: 0 };
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { avg, min, max };
}

// Handle first seed timing for accurate progress estimation
export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Extract and validate auth token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No valid authorization token provided' });
        }

        const token = authHeader.substring(7);
        if (!isValidToken(token)) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const { action, parameters } = req.body;

        if (action === 'runSimulationBatched') {
            // Run simulation in batches of 5 seeds with progress updates
            console.log(`Starting batched simulation with ${parameters.numSeeds} seeds...`);
            const startTime = Date.now();
            
            let results = [];
            let allSystemStates = {};
            let allHourlyMax = {};
            let seedTimings = []; // Track timing for rolling average
            
            // Function to collect seed data
            function collectSeedData(result) {
                results.push(result);
                
                for (let state in result.systemStatePercentages) {
                    if (!allSystemStates[state]) allSystemStates[state] = [];
                    allSystemStates[state].push(result.systemStatePercentages[state]);
                }
                
                for (let max in result.hourlyMaxDistribution) {
                    if (!allHourlyMax[max]) allHourlyMax[max] = [];
                    allHourlyMax[max].push(result.hourlyMaxDistribution[max]);
                }
            }
            
            // Run seeds in batches of 5
            for (let batchStart = 0; batchStart < parameters.numSeeds; batchStart += 5) {
                const batchEnd = Math.min(batchStart + 5, parameters.numSeeds);
                const batchStartTime = Date.now();
                
                // Run this batch of seeds
                for (let seed = batchStart; seed < batchEnd; seed++) {
                    let seedValue = null;
                    if (parameters.seedMode === 'fixed') {
                        seedValue = seed * 12345;
                    } else {
                        seedValue = Math.floor(Math.random() * 1000000);
                    }
                    
                    const result = runSingleSimulation(parameters, seedValue);
                    collectSeedData(result);
                }
                
                const batchTime = Date.now() - batchStartTime;
                const seedsInBatch = batchEnd - batchStart;
                const avgTimePerSeed = batchTime / seedsInBatch;
                
                // Add to rolling timing window (keep last 5 batch averages)
                seedTimings.push(avgTimePerSeed);
                if (seedTimings.length > 5) {
                    seedTimings.shift(); // Remove oldest timing
                }
                
                // Calculate rolling average time per seed
                const rollingAvg = seedTimings.reduce((sum, time) => sum + time, 0) / seedTimings.length;
                
                // Calculate progress and estimates
                const completedSeeds = batchEnd;
                const progress = (completedSeeds / parameters.numSeeds) * 100;
                const remainingSeeds = parameters.numSeeds - completedSeeds;
                const estimatedRemainingTime = remainingSeeds * rollingAvg + 500; // +500ms for averaging
                
                console.log(`Batch ${Math.ceil(batchEnd/5)}: ${completedSeeds}/${parameters.numSeeds} seeds (${progress.toFixed(1)}%) - Rolling avg: ${rollingAvg.toFixed(0)}ms/seed`);
                
                // Send progress update (except for final batch)
                if (completedSeeds < parameters.numSeeds) {
                    // In a real streaming setup, you'd send this as a progress event
                    // For now, we'll include it in the final response
                }
            }
            
            console.log('Starting averaging calculations...');
            const averagingStart = Date.now();
            
            // Calculate final averages
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
            
            const averagingTime = Date.now() - averagingStart;
            const totalTime = Date.now() - startTime;
            
            console.log(`Batched simulation completed in ${totalTime}ms`);
            
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

        } else if (action === 'getFirstTwoSeedsTiming') {
            // Run first two seeds and return timing info for the second seed
            console.log('Running first two seeds for timing estimation...');
            const firstTwoSeedsStart = Date.now();
            
            // Run first seed (warm-up)
            let firstSeedValue = null;
            if (parameters.seedMode === 'fixed') {
                firstSeedValue = 0 * 12345; // First seed
            } else {
                firstSeedValue = Math.floor(Math.random() * 1000000);
            }
            
            const firstSeedResult = runSingleSimulation(parameters, firstSeedValue);
            
            // Run second seed with timing measurement
            const secondSeedStart = Date.now();
            let secondSeedValue = null;
            if (parameters.seedMode === 'fixed') {
                secondSeedValue = 1 * 12345; // Second seed
            } else {
                secondSeedValue = Math.floor(Math.random() * 1000000);
            }
            
            const secondSeedResult = runSingleSimulation(parameters, secondSeedValue);
            const secondSeedTime = Date.now() - secondSeedStart;
            
            // Calculate estimated total time based on second seed performance
            const remainingSeeds = parameters.numSeeds - 2;
            const averagingTime = 500; // 0.5 seconds for averaging
            const estimatedTotalTime = (Date.now() - firstTwoSeedsStart) + (remainingSeeds * secondSeedTime) + averagingTime;
            
            console.log(`First two seeds completed. Second seed took ${secondSeedTime}ms. Estimated total: ${estimatedTotalTime}ms`);
            
            return res.status(200).json({
                success: true,
                secondSeedTime: secondSeedTime,
                estimatedTotalTime: estimatedTotalTime,
                firstSeedResult: firstSeedResult,
                secondSeedResult: secondSeedResult,
                seedsCompleted: 2
            });

        } else if (action === 'runRemainingSeeds') {
            // Run the remaining seeds (from seed 3 onwards)
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

        } else if (action === 'runSimulation') {
            // Original single-call method for backwards compatibility
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
            return res.status(400).json({ error: 'Invalid action specified' });
        }

    } catch (error) {
        console.error('Boom gate simulation error:', error);
        return res.status(500).json({ 
            error: 'Internal server error during simulation',
            details: error.message 
        });
    }
}