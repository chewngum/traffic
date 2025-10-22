const { parentPort, workerData } = require('worker_threads');

// Copy all your simulation functions here
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function generateArrivalWithHeadway(rng, rate, minHeadway, currentTime, lastArrival) {
    const expInterArrival = -Math.log(rng()) / (rate / 3600);
    const proposedTime = currentTime + expInterArrival;
    const minAllowedTime = lastArrival + minHeadway;
    return Math.max(proposedTime, minAllowedTime);
}

function runSingleParkingSimulation(seed, config) {
    // Copy your entire runSingleParkingSimulation function here
    // ... (all the simulation logic from your original file)
    const rng = mulberry32(seed);
    const SIM_TIME = config.simulationHours * 3600;
    const FEL = [];
    
    function pushEvent(time, type) {
        FEL.push([time, type]);
        FEL.sort((a, b) => a[0] - b[0]);
    }
    
    function popEvent() {
        return FEL.shift();
    }
    
    let lastEntryArrival = 0;
    let lastExitArrival = 0;
    
    if (config.entryRate > 0) {
        const firstEntry = generateArrivalWithHeadway(rng, config.entryRate, config.entryHeadway, 0, 0);
        pushEvent(firstEntry, "arrival_entry");
        lastEntryArrival = firstEntry;
    }
    if (config.exitRate > 0) {
        const firstExit = generateArrivalWithHeadway(rng, config.exitRate, config.exitHeadway, 0, 0);
        pushEvent(firstExit, "arrival_exit");
        lastExitArrival = firstExit;
    }

    const entryQueue = [];
    const exitQueue = [];
    let serverBusyUntil = 0.0;

    let busyTime = 0.0;
    let lastTime = 0.0;
    const queueLengthTimeEntry = new Map();
    const queueLengthTimeExit = new Map();
    const maxQueueEntry = new Map();
    const maxQueueExit = new Map();

    let delayedEntry = 0, totalEntry = 0;
    let delayedExit = 0, totalExit = 0;
    const entryWaitTimes = [];
    const exitWaitTimes = [];

    while (FEL.length > 0) {
        const [time, event] = popEvent();
        if (time > SIM_TIME) break;

        const dt = time - lastTime;
        const entryLen = entryQueue.length;
        const exitLen = exitQueue.length;
        
        queueLengthTimeEntry.set(entryLen, (queueLengthTimeEntry.get(entryLen) || 0) + dt);
        queueLengthTimeExit.set(exitLen, (queueLengthTimeExit.get(exitLen) || 0) + dt);
        
        lastTime = time;

        if (event === "arrival_entry") {
            totalEntry += 1;
            entryQueue.push(time);
            
            const nextEntry = generateArrivalWithHeadway(rng, config.entryRate, config.entryHeadway, time, lastEntryArrival);
            if (nextEntry <= SIM_TIME) {
                pushEvent(nextEntry, "arrival_entry");
                lastEntryArrival = nextEntry;
            }

        } else if (event === "arrival_exit") {
            totalExit += 1;
            exitQueue.push(time);
            
            const nextExit = generateArrivalWithHeadway(rng, config.exitRate, config.exitHeadway, time, lastExitArrival);
            if (nextExit <= SIM_TIME) {
                pushEvent(nextExit, "arrival_exit");
                lastExitArrival = nextExit;
            }

        } else if (event === "departure") {
            serverBusyUntil = time;
        }

        if (time >= serverBusyUntil) {
            let chosen = null;
            
            if (entryQueue.length > 0 || exitQueue.length > 0) {
                if (config.priority === "FCFS") {
                    if (entryQueue.length > 0 && exitQueue.length > 0) {
                        if (entryQueue[0] <= exitQueue[0]) {
                            chosen = ["entry", entryQueue.shift()];
                        } else {
                            chosen = ["exit", exitQueue.shift()];
                        }
                    } else if (entryQueue.length > 0) {
                        chosen = ["entry", entryQueue.shift()];
                    } else if (exitQueue.length > 0) {
                        chosen = ["exit", exitQueue.shift()];
                    }
                } else if (config.priority === "CARS") {
                    if (entryQueue.length > 0) {
                        chosen = ["entry", entryQueue.shift()];
                    } else if (exitQueue.length > 0) {
                        chosen = ["exit", exitQueue.shift()];
                    }
                } else if (config.priority === "PEOPLE") {
                    if (exitQueue.length > 0) {
                        chosen = ["exit", exitQueue.shift()];
                    } else if (entryQueue.length > 0) {
                        chosen = ["entry", entryQueue.shift()];
                    }
                }
            }

            if (chosen) {
                const [kind, arrivalTime] = chosen;
                const wait = time - arrivalTime;
                
                if (kind === "entry") {
                    if (wait > 0) delayedEntry += 1;
                    entryWaitTimes.push(wait);
                    const serviceTime = config.entryServiceTime;
                    const finishTime = time + serviceTime;
                    pushEvent(finishTime, "departure");
                    busyTime += serviceTime;
                    serverBusyUntil = finishTime;
                } else {
                    if (wait > 0) delayedExit += 1;
                    exitWaitTimes.push(wait);
                    const serviceTime = config.exitServiceTime;
                    const finishTime = time + serviceTime;
                    pushEvent(finishTime, "departure");
                    busyTime += serviceTime;
                    serverBusyUntil = finishTime;
                }
            }
        }

        const hour = Math.floor(time / 3600);
        maxQueueEntry.set(hour, Math.max(maxQueueEntry.get(hour) || 0, entryQueue.length));
        maxQueueExit.set(hour, Math.max(maxQueueExit.get(hour) || 0, exitQueue.length));
    }

    const totalTime = SIM_TIME;
    const utilisation = busyTime / totalTime;

    const entryHist = new Map();
    const exitHist = new Map();
    for (const [k, v] of queueLengthTimeEntry) {
        entryHist.set(k, v / totalTime * 100);
    }
    for (const [k, v] of queueLengthTimeExit) {
        exitHist.set(k, v / totalTime * 100);
    }

    const entryMaxHist = new Map();
    const exitMaxHist = new Map();
    const entryCounts = new Map();
    const exitCounts = new Map();
    
    for (const [h, q] of maxQueueEntry) {
        entryCounts.set(q, (entryCounts.get(q) || 0) + 1);
    }
    for (const [h, q] of maxQueueExit) {
        exitCounts.set(q, (exitCounts.get(q) || 0) + 1);
    }
    
    for (const [k, v] of entryCounts) {
        entryMaxHist.set(k, v / config.simulationHours * 100);
    }
    for (const [k, v] of exitCounts) {
        exitMaxHist.set(k, v / config.simulationHours * 100);
    }

    const avgWaitEntryArrival = totalEntry > 0 ? entryWaitTimes.reduce((a, b) => a + b, 0) / totalEntry : 0;
    const delayedEntryWaits = entryWaitTimes.filter(w => w > 0);
    const avgWaitEntryQueued = delayedEntry > 0 ? delayedEntryWaits.reduce((a, b) => a + b, 0) / delayedEntry : 0;
    
    const avgWaitExitArrival = totalExit > 0 ? exitWaitTimes.reduce((a, b) => a + b, 0) / totalExit : 0;
    const delayedExitWaits = exitWaitTimes.filter(w => w > 0);
    const avgWaitExitQueued = delayedExit > 0 ? delayedExitWaits.reduce((a, b) => a + b, 0) / delayedExit : 0;

    return {
        utilisation,
        delayEntry: totalEntry > 0 ? delayedEntry / totalEntry : 0,
        delayExit: totalExit > 0 ? delayedExit / totalExit : 0,
        entryHist,
        exitHist,
        entryMaxHist,
        exitMaxHist,
        avgWaitEntryArrival,
        avgWaitEntryQueued,
        avgWaitExitArrival,
        avgWaitExitQueued,
        totalEntries: totalEntry,
        totalExits: totalExit
    };
}

// Run simulations for the seeds assigned to this worker
const { seeds, ...config } = workerData;

const agg = {
    utilisation: 0,
    delayEntry: 0,
    delayExit: 0,
    avgWaitEntryArrival: 0,
    avgWaitEntryQueued: 0,
    avgWaitExitArrival: 0,
    avgWaitExitQueued: 0,
    totalEntries: 0,
    totalExits: 0
};

const aggEntryHist = new Map();
const aggExitHist = new Map();
const aggEntryMax = new Map();
const aggExitMax = new Map();

for (const seed of seeds) {
    const result = runSingleParkingSimulation(seed, config);
    
    agg.utilisation += result.utilisation;
    agg.delayEntry += result.delayEntry;
    agg.delayExit += result.delayExit;
    agg.avgWaitEntryArrival += result.avgWaitEntryArrival;
    agg.avgWaitEntryQueued += result.avgWaitEntryQueued;
    agg.avgWaitExitArrival += result.avgWaitExitArrival;
    agg.avgWaitExitQueued += result.avgWaitExitQueued;
    agg.totalEntries += result.totalEntries;
    agg.totalExits += result.totalExits;

    for (const [k, v] of result.entryHist) {
        aggEntryHist.set(k, (aggEntryHist.get(k) || 0) + v);
    }
    for (const [k, v] of result.exitHist) {
        aggExitHist.set(k, (aggExitHist.get(k) || 0) + v);
    }
    for (const [k, v] of result.entryMaxHist) {
        aggEntryMax.set(k, (aggEntryMax.get(k) || 0) + v);
    }
    for (const [k, v] of result.exitMaxHist) {
        aggExitMax.set(k, (aggExitMax.get(k) || 0) + v);
    }
}

// Convert Maps to objects
const entryHist = {};
const exitHist = {};
const entryMaxHist = {};
const exitMaxHist = {};

for (const [k, v] of aggEntryHist) entryHist[k] = v;
for (const [k, v] of aggExitHist) exitHist[k] = v;
for (const [k, v] of aggEntryMax) entryMaxHist[k] = v;
for (const [k, v] of aggExitMax) exitMaxHist[k] = v;

parentPort.postMessage({
    ...agg,
    entryHist,
    exitHist,
    entryMaxHist,
    exitMaxHist,
    seedCount: seeds.length
});