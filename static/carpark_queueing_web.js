var headroom = 0;
function percentageOfTime(percent, list) {
    let cumulativeSum = 0;
    const totalTime = list.reduce((sum, value) => sum + value, 0);
    const targetSum = (totalTime * percent) / 100;

    for (let index = 0; index < list.length; index++) {
        cumulativeSum += list[index];
        if (cumulativeSum >= targetSum) {
            return index;
        }
    }
    return 0;
}

function calculatePercentiles(countCarsParked, countCarsQueued) {
    const percentiles = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
    const results = new Map();

    for (const p of percentiles) {
        results.set(p, {
            parked: percentageOfTime(p, countCarsParked),
            queued: percentageOfTime(p, countCarsQueued)
        });
    }

    return Object.fromEntries(results);
}

function runSimulation(inp) {
    const startTime = performance.now();
    var lastarrival = 0;
    const arrivalThreshold = inp.arrivalRate / (3600 * inp.precision - inp.arrivalRate * headroom * inp.precision);
    const state = {
        carsParked: [],
        carsQueued: 0,
        countArrivals: 0,
        countCarsParked: new Array(inp.spaces + 1).fill(0),
        countCarsQueued: new Array(Math.ceil(inp.arrivalRate * inp.serviceTime * 100)).fill(0),
        queue: 0,
        queueTest: 0,
        queueTime: 0
    };

    let hours = 0;
    const serviceTimeSteps = Math.ceil(inp.serviceTime * inp.precision);  // Adjust for decimal serviceTime

    for (let i = 1; i <= inp.cycles * inp.hours_in_steps; i++) {
        if (i > 3600 * 1000 * inp.precision && i % 36000 * inp.precision === 0) {
            hours = i / inp.hours_in_steps;
            const currentQueueRatio = state.carsQueued / state.countArrivals;
            if (Math.abs(state.queueTest - currentQueueRatio) <= 1e-6) {
                break;
            } else {
                state.queueTest = currentQueueRatio;
            }
        }

        // Check if a new car arrived and add to the car park
        if (lastarrival + headroom * inp.precision < i){
            if (Math.random() <= arrivalThreshold) {
                state.countArrivals++;
                lastarrival = i
                if (state.carsParked.length < inp.spaces) {
                    state.carsParked.push(serviceTimeSteps);
                } else {
                    state.queue++;
                    state.carsQueued++;

                }
            }
        }    

        // Count current car park utilization
        const index = Math.max(state.carsParked.length, 0);
        state.countCarsParked[index]++;
        state.countCarsQueued[state.queue]++;
        state.queueTime += state.queue;

        // Reduce parked cars' time remaining
        if (state.carsParked.length >= 1) {
            for (let j = 0; j < state.carsParked.length; j++) {
                state.carsParked[j]--;
            }

            // Move finished cars out and queued cars in
            if (state.carsParked[0] === 0) {

                state.carsParked.shift();
                if (state.queue > 0) {
                    state.carsParked.push(serviceTimeSteps);  // Adjust for decimal serviceTime

                    state.queue--;
                }
            }
        }
    }

    const elapsedMs = performance.now() - startTime;
    return {
        elapsedTime: `${Math.round(elapsedMs)}ms`,
        hours,
        PercentCarsQueued: ((state.carsQueued * 100) / state.countArrivals).toFixed(1),
        QueueTimePerQueuedVehicle: (state.queueTime / state.carsQueued / inp.precision).toFixed(1),
        QueueTimePerArrival: (state.queueTime / state.countArrivals / inp.precision).toFixed(1),
        theoreticalMinSpace: ((inp.arrivalRate * (inp.serviceTime)) / inp.hours_in_steps * inp.precision).toFixed(2),
        modelDemandSpace: (state.countArrivals * (inp.serviceTime) / hours / 3600).toFixed(2),
        percentiles: calculatePercentiles(state.countCarsParked, state.countCarsQueued)
    };
}

// Format results as a readable string
export function formatResults(results) {
    if (!results || typeof results !== 'object') {
        return 'Error: Invalid simulation results.';
    }

    let output = `Queueing Results:\n`;
    output += `-----------------------------\n`;
    output += `Elapsed Time: ${results.elapsedTime || 'N/A'}\n`;
    output += `Simulated Hours: ${results.hours || 'N/A'}\n`;
    output += `Theoretical Min Spaces: ${results.theoreticalMinSpace || 'N/A'}\n`;
    output += `Model Demand Spaces: ${results.modelDemandSpace || 'N/A'}\n`;
    output += `Percentage of Cars Queued: ${results.PercentCarsQueued || 'N/A'}%\n`;
    output += `Avg. Queue Time per Queued Vehicle: ${results.QueueTimePerQueuedVehicle || 'N/A'} sec\n`;
    output += `Avg. Queue Time per Arrival: ${results.QueueTimePerArrival || 'N/A'} sec\n`;
    output += `-----------------------------\n`;
    output += `Percentiles (Parked | Queued):\n`;

    // ✅ Ensure percentiles are correctly formatted
    if (results.percentiles && typeof results.percentiles === 'object') {
        for (const [percentile, values] of Object.entries(results.percentiles)) {
            output += `${percentile}%: ${values.parked ?? 'N/A'} | ${values.queued ?? 'N/A'}\n`;
        }
    } else {
        output += `Percentiles data not available.\n`;
    }
    return output;
}

// Main function to simulate the process
export function test(a, b, c, h) {
    let d =1;
    if ((a % 1 !== 0) || (b % 1 !== 0) || (h % 1 !== 0)  ) {
        d = 10;
    }
    headroom = h
    const inputs = {
        arrivalRate: Number(a),
        cycles: 3000,
        precision: d,
        hours_in_steps: 3600 * d,
        serviceTime: Number(b),
        spaces: Number(c)
        
    };

    if (inputs.arrivalRate * inputs.serviceTime / 3600 > inputs.spaces) {
        return 'Error: Arrival rate too high for available spaces.';
    } else {
        try {
            const results = formatResults(runSimulation(inputs));
            return results;
        } catch (error) {
            console.error('Error running simulation:', error);
        }
    }
}
