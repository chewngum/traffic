

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

function runSimulation(a, b, c) {
    const startTime = performance.now();
    let arrivalRate = a;
    let serviceTime = b;
    let spaces = c;
    let precision = 1;
    let cycleCount = 10000;

    let hours = 0;
    let arrival = 0;
    let countArrivals = 0;
    let countCarsParked = new Array(arrivalRate * serviceTime).fill(0);  // pre-allocate array
    let countServiced = 0;
    let countBlocked = 0;
    let carsParked = [];
    let blocktest = 0;
    let totalTime = 0; // total time for percentiles



    for (let i = 1; i <= cycleCount * 3600 * precision; i++) {
        if (i > (3600 * 1000 * precision) && i % (36000 * precision) === 0) {
            hours = i / 3600 / precision;
            const currentblockratio = countBlocked / countArrivals;
            if (Math.abs(blocktest - currentblockratio) <= 1e-6) {
                break;
            } else {
                blocktest = currentblockratio;
            }
        }

        // Generate arrival with less calculation
        if (Math.random() <= arrivalRate / 3600 / precision) {
            countArrivals++;
            if (carsParked.length < spaces) {
                carsParked.push(serviceTime * precision);
                countServiced++;
            } else {
                countBlocked++;
            }
        }

        // Parked car logic: In-place decrement and removal when necessary
        for (let j = 0; j < carsParked.length; j++) {
            carsParked[j]--;
            while (carsParked.length > 0 && carsParked[0] === 0) {
                carsParked.shift(); // Remove the first element if it's 0
            }
            
        }

        // Update parking stats
        countCarsParked[Math.min(carsParked.length, countCarsParked.length - 1)]++;
    }

    // Calculate the elapsed time in reality and model
    cycleCount = hours;
    const  elapsedTime = performance.now()- startTime;

    let textout = `Blocking Results:\n`;
    textout += `-----------------------------\n`;
    textout += `Elapsed: ${Math.round(elapsedTime)}ms\n`;
    textout += `Simulated Hours: ${hours} \n`;
    textout += `Theoretical Min Spaces : ${(((arrivalRate * serviceTime) / (3600)).toFixed(2))}\n`;
    textout += `Model Demand Spaces: ${(((countArrivals * serviceTime) / (3600 * cycleCount )).toFixed(2))}\n`;
    textout += `Percentage of Cars Blocked: ${(countBlocked * 100 / countArrivals).toFixed(1)}%\n`;
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

    try {
        const results = runSimulation(a, b, c);
        return results;
    } catch (error) {
        console.error('Error running simulation:', error);
    }
}
