// Define Functions
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
}

// Define constants and initialize variables
var arrivalRate = 100
var serviceTime = 100
var spaces = 6
let precision = 1; // You can adjust this as needed
let cycleCount = 10000;
let carsParked = [];
let arrival = 0;
let countArrivals = 0;
let countCarsParked = Array(arrivalRate * serviceTime).fill(0);
let countServiced = 0;
let countBlocked = 0;
const percentiles = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
let blockTest = 0;
let hours = 0;

export function runSimulation(a,b,c){
    // Generate Arrivals and simulate the process
    arrivalRate = a;
    serviceTime = b;
    spaces = c;
    const startTime = performance.now();
    for (let i = 1; i <= cycleCount * 3600 * precision; i++) {
        if (i % 36000 === 0 && i > 3600 * 1000) {
            if (blockTest === Math.round(countBlocked / countArrivals, 5)) {
                hours = i / 3600;
                break;
            } else {
                blockTest = Math.round(countBlocked / countArrivals, 5);
                hours = i / 3600;
            }
        }

        // Check if a new car has arrived and add to the car park
        arrival = Math.floor(Math.random() * (3600 * precision)) + 1;
        if (arrival <= arrivalRate * precision) {
            countArrivals++;
            if (carsParked.length < spaces) {
                carsParked.push(serviceTime);
                countServiced++;
            } else {
                countBlocked++;
            }
        }

        // Count current carpark utilization
        countCarsParked[Math.max(carsParked.length, 0)]++;

        // Reduce parked cars' remaining time by passing time
        if (carsParked.length > 0) {
            carsParked = carsParked.map(item => item - 1);
            if (carsParked[0] === 0) {
                carsParked.shift();
            }
        }
    }

    // Calculate the elapsed time in reality and model
    cycleCount = hours;
    const endTime = performance.now();
    const elapsedTime = (endTime - startTime); // seconds
    let textout = `Blocking Results:\n`;
    textout += `-----------------------------\n`;
    textout += `Elapsed: ${Math.round(elapsedTime)}ms\n`;
    textout += `Simulated Hours: ${hours} \n`;
    textout += `Percentage of Cars Blocked: ${(countBlocked *100 / countArrivals).toFixed(1)}%\n\n\n`;
    textout += `Theoretical Min Spaces : ${(((arrivalRate * serviceTime) / (3600 * precision)).toFixed(2))}\n`;
    textout += `Model Demand Spaces: ${(((countArrivals * serviceTime) / (3600 * cycleCount * precision)).toFixed(2))}\n`;
    textout += `-----------------------------\n`;
    textout += `Percentiles (Parked):\n`;

    // Find Percentage Thresholds
    percentiles.forEach(value => {
        textout += `${value}%: ${percentageOfTime(value, countCarsParked)}\n`;
    });

    
    return textout;
}

// Elapsed Time: 3936ms
// Simulated Hours: 5011
// Percentage of Cars Queued: 6.7%
// Avg. Queue Time per Queued Vehicle: 20.9 sec
// Avg. Queue Time per Arrival: 1.4 sec
// Theoretical Min Spaces Needed: 0.28
// Model Demand Spaces: 0.28

export default function main(a, b, c) {
    try {
        const results = runSimulation(a, b, c);
        return results;
    } catch (error) {
        console.error('Error running simulation:', error);
    }
}