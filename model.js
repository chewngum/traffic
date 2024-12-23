const HOURS_IN_SECONDS = 3600;
const [arg1, arg2, arg3] = process.argv.slice(2);

function percentageOfTime(percent, list) {
    let cumulativeSum = 0;
    const totalTime = list.reduce((sum, value) => sum + value, 0);
    const targetSum = totalTime * percent / 100;

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

    return results;
}

function runSimulation(inp) {
    console.dir(inp, { depth: 4 });
    const startTime = performance.now();

    const state = {
        carsParked: [],
        carsQueued: 0,
        countArrivals: 0,
        countCarsParked: new Array(inp.spaces + 1).fill(0),
        countCarsQueued: new Array(inp.arrivalRate * inp.serviceTime).fill(0),
        queue: 0,
        queueTest: 0,
        queueTime: 0
    };

    let hours = 0;
    for (let i = 1; i <= inp.cycles * HOURS_IN_SECONDS; i++) {
        
        if (i > 3600000 && i % 36000 === 0) {
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
                state.carsParked.push(inp.serviceTime);
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
                    state.carsParked.push(inp.serviceTime);
                    state.queue--;
                }
            }
        }
    }
    const elapsedMs = performance.now() - startTime;
    const results = {
        elapsedTime: `${Math.round(elapsedMs)}ms`,
        hours,
        PercentCarsQueued: ((state.carsQueued * 100) / state.countArrivals).toFixed(1),
        QueueTimePerQueuedVehicle: (state.queueTime / state.carsQueued).toFixed(1),
        QueueTimePerArrival: (state.queueTime / state.countArrivals).toFixed(1),
        theoreticalMinSpace: ((state.countArrivals / hours * inp.serviceTime) / HOURS_IN_SECONDS).toFixed(2),
        modelDemandSpace: ((inp.arrivalRate * inp.serviceTime) / HOURS_IN_SECONDS).toFixed(2),
        percentiles: calculatePercentiles(state.countCarsParked, state.countCarsQueued)
    };

    console.dir(results, { depth: 4 });
    return results;
}

export default function main() {
    const inputs = {
        arrivalRate: Number(arg1),
        cycles: 10000,
        precision: 1,
        serviceTime: Number(arg2),
        spaces: Number(arg3)
    };

    runSimulation(inputs);
}

main()