
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

function calculatePercentiles(countCarsParked) {
    const percentiles = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
    const results = {};
    for (const p of percentiles) {
        results[p] = percentageOfTime(p, countCarsParked);
    }
    return results;
}

function initializeSimulation(inp) {
    let serviceTime = inp.serviceTime * precision;
    let countArrivals = 0;
    let countCarsParked = new Uint32Array(inp.serviceTime * inp.arrivalRate + 1);
    let carsParked = new Uint32Array(serviceTime * inp.arrivalRate);
    let carIndex = 0;
    let carCount = 0;
    let arrivalRateProbability = (inp.arrivalRate * precision) / HOURS_IN_SECONDS;

    return {
        serviceTime,
        countArrivals,
        countCarsParked,
        carsParked,
        carIndex,
        carCount,
        arrivalRateProbability
    };
}

function processArrivals(state) {
    if (Math.random() < state.arrivalRateProbability) {
        state.countArrivals++;
        state.carsParked[(state.carIndex + state.carCount) % state.carsParked.length] = state.serviceTime;
        state.carCount++;
    }
}

function updateCarParkUtilization(state) {
    state.countCarsParked[state.carCount]++;
}

function reduceParkedCarsTime(state) {
    if (state.carCount > 0) {
        for (let j = 0; j < state.carCount; j++) {
            state.carsParked[(state.carIndex + j) % state.carsParked.length]--;
        }

        while (state.carCount > 0 && state.carsParked[state.carIndex] === 0) {
            state.carIndex = (state.carIndex + 1) % state.carsParked.length;
            state.carCount--;
        }
    }
}

function runSimulationLoop(state, cycles) {
    for (let i = 1; i <= cycles * HOURS_IN_SECONDS; i++) {
        processArrivals(state);
        updateCarParkUtilization(state);
        reduceParkedCarsTime(state);
    }
}

function runSimulation(inp) {
    const startTime = performance.now();
    const state = initializeSimulation(inp);

    runSimulationLoop(state, inp.cycles);

    let hours = inp.cycles;  // Correctly set simulated hours

    const elapsedMs = performance.now() - startTime;
    return {
        elapsedTime: `${Math.round(elapsedMs)}ms`,
        hours,
        arrivalRate: inp.arrivalRate,
        serviceTime: inp.serviceTime,
        precision: inp.precision,
        countArrivals: state.countArrivals,
        percentiles: calculatePercentiles(state.countCarsParked)
    };
}

export function formatResults(results) {
    if (!results || typeof results !== 'object') {
        return 'Error: Invalid simulation results.';
    }
    let output = `Infinite Carpark Results:\n`;
    output += `-----------------------------\n`;
    output += `Elapsed Time: ${results.elapsedTime}\n`;
    output += `Simulated Hours: ${results.hours}\n`;
    output += `Theoretical Min Spaces: ${((results.arrivalRate * results.serviceTime) / (3600 * results.precision)).toFixed(2)}\n`;
    output += `Model Demand Spaces: ${((results.countArrivals * results.serviceTime) / (3600 * results.hours * results.precision)).toFixed(2)}\n`;
    output += `\n\n\n-----------------------------\n`;
    output += `Percentiles (Parked):\n`;
    for (const [percentile, value] of Object.entries(results.percentiles)) {
        output += `${percentile}%: ${value}\n`;
    }
    return output;
}

export function test(a, b, c) {
    precision = 1;
    const inputs = {
        arrivalRate: Number(a),
        cycles: 2500,
        precision: precision,
        HOURS_IN_SECONDS: 3600 * precision,
        serviceTime: Number(b),
        spaces: Number(c)
    };
    HOURS_IN_SECONDS = 3600 * precision;
    try {
        const results = formatResults(runSimulation(inputs));
        return results;
    } catch (error) {
        console.error('Error running simulation:', error);
    }
}
