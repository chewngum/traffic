export default async function handler(req, res) {
  // Check authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Simple token validation (decode base64)
    const decoded = Buffer.from(token, 'base64').toString();
    const [timestamp, username] = decoded.split(':');

    // Check if token is less than 24 hours old
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(401).json({ error: 'Token expired' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, parameters } = req.body;

  try {
    if (action === 'runParkingSimulation') {
      const startTime = Date.now();
      const results = await runMultipleParkingSimulations(parameters);
      const executionTimeMs = Date.now() - startTime;

      console.log(`Mechanical Parking simulation completed in ${executionTimeMs}ms`);
      res.json({ success: true, results, executionTimeMs });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Simulation failed: ' + error.message });
  }
}

// PROTECTED: All parking simulation logic hidden on server
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateArrivalWithHeadway(rng, rate, minHeadway, currentTime, lastArrival) {
  // Generate exponential inter-arrival time
  const expInterArrival = -Math.log(rng()) / (rate / 3600);
  
  // Calculate next arrival time based on exponential distribution
  const proposedTime = currentTime + expInterArrival;
  
  // Enforce minimum headway constraint
  const minAllowedTime = lastArrival + minHeadway;
  const actualTime = Math.max(proposedTime, minAllowedTime);
  
  return actualTime;
}

function runSingleParkingSimulation(seed, config) {
  const rng = mulberry32(seed);
  
  const SIM_TIME = config.simulationHours * 3600;
  
  // Event list: [time, type]
  const FEL = [];
  
  function pushEvent(time, type) {
    FEL.push([time, type]);
    FEL.sort((a, b) => a[0] - b[0]);
  }
  
  function popEvent() {
    return FEL.shift();
  }
  
  // Track last arrival times for headway enforcement
  let lastEntryArrival = 0;
  let lastExitArrival = 0;
  
  // Initial events with headway consideration
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

  // State
  const entryQueue = [];
  const exitQueue = [];
  let serverBusyUntil = 0.0;

  // Statistics
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

    // Record queue length time
    const dt = time - lastTime;
    const entryLen = entryQueue.length;
    const exitLen = exitQueue.length;
    
    queueLengthTimeEntry.set(entryLen, (queueLengthTimeEntry.get(entryLen) || 0) + dt);
    queueLengthTimeExit.set(exitLen, (queueLengthTimeExit.get(exitLen) || 0) + dt);
    
    lastTime = time;

    if (event === "arrival_entry") {
      totalEntry += 1;
      entryQueue.push(time);
      
      // Schedule next entry with headway constraint
      const nextEntry = generateArrivalWithHeadway(rng, config.entryRate, config.entryHeadway, time, lastEntryArrival);
      if (nextEntry <= SIM_TIME) {
        pushEvent(nextEntry, "arrival_entry");
        lastEntryArrival = nextEntry;
      }

    } else if (event === "arrival_exit") {
      totalExit += 1;
      exitQueue.push(time);
      
      // Schedule next exit with headway constraint
      const nextExit = generateArrivalWithHeadway(rng, config.exitRate, config.exitHeadway, time, lastExitArrival);
      if (nextExit <= SIM_TIME) {
        pushEvent(nextExit, "arrival_exit");
        lastExitArrival = nextExit;
      }

    } else if (event === "departure") {
      serverBusyUntil = time;
    }

    // Start service if server free
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

    // Record max queue per hour
    const hour = Math.floor(time / 3600);
    maxQueueEntry.set(hour, Math.max(maxQueueEntry.get(hour) || 0, entryQueue.length));
    maxQueueExit.set(hour, Math.max(maxQueueExit.get(hour) || 0, exitQueue.length));
  }

  // Calculate results
  const totalTime = SIM_TIME;
  const utilisation = busyTime / totalTime;

  // Convert to percentages
  const entryHist = new Map();
  const exitHist = new Map();
  for (const [k, v] of queueLengthTimeEntry) {
    entryHist.set(k, v / totalTime * 100);
  }
  for (const [k, v] of queueLengthTimeExit) {
    exitHist.set(k, v / totalTime * 100);
  }

  // Max queue histograms
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

  // Wait time calculations
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

async function runMultipleParkingSimulations(params) {
  const numSeeds = params.numSeeds;
  const seedMode = params.seedMode;
  
  // Generate seeds based on mode
  let seeds = [];
  if (seedMode === 'random') {
    // Generate random seeds
    for (let i = 0; i < numSeeds; i++) {
      seeds.push(Math.floor(Math.random() * 2147483647)); // Max 32-bit integer
    }
  } else {
    // Use fixed sequential seeds (reproducible)
    for (let i = 0; i < numSeeds; i++) {
      seeds.push(i);
    }
  }
  
  // Aggregate results
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

  for (let i = 0; i < numSeeds; i++) {
    const result = runSingleParkingSimulation(seeds[i], params);
    
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

  // Calculate averages (but not for totals - we want the sum for those)
  for (const key in agg) {
    if (key !== 'totalEntries' && key !== 'totalExits') {
      agg[key] /= numSeeds;
    }
  }
  for (const [k, v] of aggEntryHist) {
    aggEntryHist.set(k, v / numSeeds);
  }
  for (const [k, v] of aggExitHist) {
    aggExitHist.set(k, v / numSeeds);
  }
  for (const [k, v] of aggEntryMax) {
    aggEntryMax.set(k, v / numSeeds);
  }
  for (const [k, v] of aggExitMax) {
    aggExitMax.set(k, v / numSeeds);
  }

  // Convert Maps to objects for JSON serialization
  const entryHist = {};
  const exitHist = {};
  const entryMaxHist = {};
  const exitMaxHist = {};
  
  for (const [k, v] of aggEntryHist) {
    entryHist[k] = v;
  }
  for (const [k, v] of aggExitHist) {
    exitHist[k] = v;
  }
  for (const [k, v] of aggEntryMax) {
    entryMaxHist[k] = v;
  }
  for (const [k, v] of aggExitMax) {
    exitMaxHist[k] = v;
  }

  return {
    utilisation: agg.utilisation,
    delayEntry: agg.delayEntry,
    delayExit: agg.delayExit,
    avgWaitEntryArrival: agg.avgWaitEntryArrival,
    avgWaitEntryQueued: agg.avgWaitEntryQueued,
    avgWaitExitArrival: agg.avgWaitExitArrival,
    avgWaitExitQueued: agg.avgWaitExitQueued,
    entryHist,
    exitHist,
    entryMaxHist,
    exitMaxHist,
    totalEntries: agg.totalEntries,
    totalExits: agg.totalExits,
    numSeeds,
    seedMode,
    seeds: seedMode === 'random' ? seeds : undefined // Include seeds for debugging random mode
  };
}