var precision = 1;
var HOURS_IN_SECONDS = 3600 * precision;

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
    console.dir(inp, { depth: 2 });
    const startTime = performance.now();

    const state = {
        carsParked: [],
        carsQueued: 0,
        countArrivals: 0,
        countCarsParked: new Array(inp.spaces + 1).fill(0),
        countCarsQueued: new Array(Math.ceil(inp.arrivalRate * inp.serviceTime)).fill(0),
        queue: 0,
        queueTest: 0,
        queueTime: 0
    };

    let hours = 0;
    for (let i = 1; i <= inp.cycles * HOURS_IN_SECONDS; i++) {
        if (i > 3600*500*precision && i % 36000*precision === 0) {
            hours = i / HOURS_IN_SECONDS;
            const currentQueueRatio = state.carsQueued / state.countArrivals;
            if (Math.abs(state.queueTest - currentQueueRatio) <= 1e-6) {
                break;
            } else {
                state.queueTest = currentQueueRatio;
            }
        }

        // Check if a new car arrived and add to the car park
        const arrival = Math.floor(Math.random() * (HOURS_IN_SECONDS * inp.precision)) + 1;
        if (arrival <= inp.arrivalRate * inp.precision) {
            state.countArrivals++;
            if (state.carsParked.length < inp.spaces) {
                state.carsParked.push(inp.serviceTime*inp.precision);
            } else {
                state.queue++;
                state.carsQueued++;
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
                    state.carsParked.push(inp.serviceTime*inp.precision);
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
        QueueTimePerQueuedVehicle: (state.queueTime / state.carsQueued / precision).toFixed(1),
        QueueTimePerArrival: (state.queueTime / state.countArrivals / precision).toFixed(1),
        theoreticalMinSpace: ((state.countArrivals / hours * inp.serviceTime) / HOURS_IN_SECONDS * precision).toFixed(2),
        modelDemandSpace: ((inp.arrivalRate * inp.serviceTime) / HOURS_IN_SECONDS * precision).toFixed(2),
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
    output += `Percentage of Cars Queued: ${results.PercentCarsQueued || 'N/A'}%\n`;
    output += `Avg. Queue Time per Queued Vehicle: ${results.QueueTimePerQueuedVehicle || 'N/A'} sec\n`;
    output += `Avg. Queue Time per Arrival: ${results.QueueTimePerArrival || 'N/A'} sec\n`;
    output += `Theoretical Min Spaces: ${results.theoreticalMinSpace || 'N/A'}\n`;
    output += `Model Demand Spaces: ${results.modelDemandSpace || 'N/A'}\n`;
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

function getDecimalPlaces(num) {
    if (!num.toString().includes('.')) return 0; // No decimal places
    return num.toString().split('.')[1].length;  // Count decimal places
}

// Main function to simulate the process
export function main(a, b, c) {

    // // Convert inputs to numbers
    // const numA = Number(a);
    // const numB = Number(b);
    // const numC = Number(c);

    // // Find the max decimal places
    // const maxDecimalPlaces = Math.max(
    //     getDecimalPlaces(numA), 
    //     getDecimalPlaces(numB), 
    //     getDecimalPlaces(numC)
    // );

    // // Set precision as 10^maxDecimalPlaces
    // precision = Math.pow(10, maxDecimalPlaces);
    precision = 1;
    const inputs = {
        arrivalRate: Number(a),
        cycles: 10000,
        precision: precision,
        HOURS_IN_SECONDS: 3600*precision,
        serviceTime: Number(b),
        spaces: Number(c)
    };
    HOURS_IN_SECONDS = 3600 * precision;
    try {
        const results = runSimulation(inputs);
        return formatResults(results);
    } catch (error) {
        console.error('Error running simulation:', error);
    }
}

