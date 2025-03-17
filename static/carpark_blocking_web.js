// Define Functions
function percentageOfTime(percent, list, totalTime) {
    const targetSum = totalTime * percent / 100;
    let cumulativeSum = 0;
    for (let index = 0; index < list.length; index++) {
        cumulativeSum += list[index];
        if (cumulativeSum >= targetSum) {
            return index;
        }
    }
}

const percentiles = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];

function runSimulation(a, b, c, d) {
    const startTime = performance.now();
    let arrivalRate = a;
    let serviceTime = b;
    let spaces = c;
    let precision = d;
    let cycleCount = 3000;
    const headroom = 0;
    var lastarrival = 0;
    let hours = 0;
    let arrival = 0;
    let countArrivals = 0;
    let countCarsParked = new Array(Math.max(1, Math.ceil(arrivalRate * serviceTime))).fill(0);
    let countServiced = 0;
    let countBlocked = 0;
    let carsParked = [];
    let blocktest = 0;
    let totalTime = 0; // total time for percentiles

    // Precompute reusable values
    const arrivalThreshold = arrivalRate / (3600 * precision - arrivalRate * headroom * precision);
    const serviceTimeSteps = Math.ceil(serviceTime * precision);
    const hourSteps = 3600 * precision;
    const checkInterval = 36000 * precision;
    const maxIndex = countCarsParked.length - 1;

    for (let i = 1; i <= cycleCount * 3600 * precision; i++) {
        if (i > (hourSteps * 1000) && i % checkInterval === 0) {
            hours = i / 3600 / precision;
            const currentblockratio = countBlocked / countArrivals;
            if (Math.abs(blocktest - currentblockratio) <= 1e-6) {
                break;
            } else {
                blocktest = currentblockratio;
            }
        }

        // Generate arrival with less calculation
        if (lastarrival + headroom * precision <= i){
            if (Math.random() <= arrivalThreshold) {
                countArrivals++;
                lastarrival = i;
                if (carsParked.length < spaces) {
                    carsParked.push(serviceTimeSteps);
                    countServiced++;
                } else {
                    countBlocked++;
                }
            }
        }

        // Parked car logic: In-place decrement and removal when necessary
        for (let j = 0; j < carsParked.length; j++) {
            carsParked[j]--;
        }

        // Remove parked cars that are done
        while (carsParked.length > 0 && carsParked[0] === 0) {
            carsParked.shift();
        }

        // Update parking stats
        countCarsParked[Math.min(carsParked.length, maxIndex)]++;
    }

    // Calculate the elapsed time in reality and model
    const elapsedTime = performance.now() - startTime;

    let textout = `Blocking Results:\n`;
    textout += `-----------------------------\n`;
    textout += `Elapsed: ${Math.round(elapsedTime)}ms\n`;
    textout += `Simulated Hours: ${hours} \n`;
    textout += `Theoretical Min Spaces: ${(((arrivalRate * (serviceTime)) / (3600)).toFixed(2))}\n`;
    textout += `Model Demand Spaces: ${(((countArrivals * serviceTime) / (3600 * hours)).toFixed(2))}\n`;
    textout += `Model Demand Spaces: ${(countArrivals / arrivalRate / hours).toFixed(3)}\n`;

    // Precompute percentage
    const blockedPercentage = ((countBlocked * 100) / countArrivals).toFixed(1);
    textout += `Percentage of Cars Blocked: ${blockedPercentage}%\n`;
    textout += `\n\n-----------------------------\n`;
    textout += `Percentiles (Parked):\n`;

    // Calculate total time for percentiles upfront
    totalTime = countCarsParked.reduce((sum, value) => sum + value, 0);

    // Find Percentage Thresholds
    percentiles.forEach(value => {
        textout += `${value}%: ${percentageOfTime(value, countCarsParked, totalTime)}\n`;
    });

    return textout;
}

export function test(a, b, c) {
    let d =1;
    if ((a % 1 !== 0) || (b % 1 !== 0) ) {
        d = 10;
    }
    try {
        const results = runSimulation(a, b, c, d);
        return results;
    } catch (error) {
        console.error('Error running simulation:', error);
    }
}
