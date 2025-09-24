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
    if (action === 'runSimulation') {
      const results = await runMultipleCarLiftSimulations(parameters);
      res.json({ success: true, results });
    } else if (action === 'validateCapacity') {
      const validation = validateliftCapacity(parameters);
      res.json({ success: true, validation });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Simulation failed: ' + error.message });
  }
}

// Ultra-fast minimal priority queue
class FastQueue {
  constructor() {
    this.items = [];
    this.size = 0;
  }
  
  push(time, type, data = null) {
    const item = { time, type, data };
    let pos = this.size++;
    
    // Simple insertion sort for small queues, binary search for larger
    if (this.size < 50) {
      while (pos > 0 && this.items[pos - 1].time > time) {
        this.items[pos] = this.items[pos - 1];
        pos--;
      }
      this.items[pos] = item;
    } else {
      // Binary heap for larger queues
      this.items[pos] = item;
      while (pos > 0) {
        const parent = Math.floor((pos - 1) / 2);
        if (this.items[parent].time <= time) break;
        [this.items[pos], this.items[parent]] = [this.items[parent], this.items[pos]];
        pos = parent;
      }
    }
  }
  
  pop() {
    if (this.size === 0) return null;
    
    const root = this.items[0];
    this.size--;
    
    if (this.size > 0) {
      this.items[0] = this.items[this.size];
      let pos = 0;
      
      while (true) {
        let smallest = pos;
        const left = 2 * pos + 1;
        const right = 2 * pos + 2;
        
        if (left < this.size && this.items[left].time < this.items[smallest].time) {
          smallest = left;
        }
        if (right < this.size && this.items[right].time < this.items[smallest].time) {
          smallest = right;
        }
        
        if (smallest === pos) break;
        
        [this.items[pos], this.items[smallest]] = [this.items[smallest], this.items[pos]];
        pos = smallest;
      }
    }
    
    return root;
  }
  
  isEmpty() {
    return this.size === 0;
  }
}

// Simplified passenger object
class Passenger {
  constructor(origin, destination, arrivalTime) {
    this.origin = origin;
    this.destination = destination;
    this.arrivalTime = arrivalTime;
    this.boardTime = 0;
    this.exitTime = 0;
  }
}

// Fast RNG with minimal state
class FastRNG {
  constructor(seed) {
    this.state = seed * 1664525 + 1013904223;
  }
  
  next() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state * 2.3283064365386963e-10; // / 2^32
  }
  
  exponential(rate) {
    return -Math.log(1 - this.next()) / rate;
  }
}

function validateliftCapacity(parameters) {
  const { numFloors, lobbyFloor, doorOpenTime, doorCloseTime, enterTime, 
          exitTime, verticalSpeed, bufferTime, arrivalRates, departureRates } = parameters;

  let totalArrivalRate = 0;
  let totalDepartureRate = 0;
  let maxUtilization = 0;
  let minUtilization = 0;
  
  // Pre-calculate for all floors at once
  for (let f = 1; f <= numFloors; f++) {
    if (f === lobbyFloor) continue;
    
    const arrivalRate = arrivalRates[f] || 0;
    const departureRate = departureRates[f] || 0;
    const totalRate = arrivalRate + departureRate;
    const distance = Math.abs(f - lobbyFloor);
    
    totalArrivalRate += arrivalRate;
    totalDepartureRate += departureRate;
    
    // Quick utilization estimates
    const travelTime = distance * verticalSpeed;
    const bufferTimeTotal = distance > 0 ? bufferTime : 0;
    
    // Max: individual round trips
    const maxTimePerTrip = enterTime + 2*doorCloseTime + 2*travelTime + 2*bufferTimeTotal + 
                         2*doorOpenTime + exitTime;
    maxUtilization += totalRate * maxTimePerTrip;
    
    // Min: optimal batching
    const minTimePerTrip = enterTime + doorCloseTime + travelTime + bufferTimeTotal +
                         doorOpenTime + exitTime;
    minUtilization += totalRate * minTimePerTrip;
  }
  
  maxUtilization = (maxUtilization / 3600) * 100;
  minUtilization = (minUtilization / 3600) * 100;
  
  return {
    minimum: minUtilization,
    maximum: maxUtilization,
    capacityExceeded: minUtilization > 100,
    maxExceedsCapacity: maxUtilization > 100
  };
}

async function runMultipleCarLiftSimulations(parameters) {
  const numSeeds = Math.min(parameters.numSeeds || 100, 1000); // Cap at 1000 seeds
  const results = [];
  
  // Process in smaller batches to avoid memory issues
  const batchSize = 50;
  for (let start = 0; start < numSeeds; start += batchSize) {
    const end = Math.min(start + batchSize, numSeeds);
    const batchResults = [];
    
    for (let seed = start; seed < end; seed++) {
      const result = simulateCarLiftoptimised(seed, parameters);
      batchResults.push(result);
    }
    
    results.push(...batchResults);
    
    // Allow event loop to breathe between batches
    if (start + batchSize < numSeeds) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  
  return averageCarLiftResults(results);
}

function simulateCarLiftoptimised(seed, parameters) {
  const { numFloors, lobbyFloor, simHours, doorOpenTime, enterTime, doorCloseTime, 
          verticalSpeed, exitTime, bufferTime, minHeadway, arrivalRates, departureRates } = parameters;
          
  const simTime = Math.min(simHours * 3600.0, 36000); // Cap at 10 hours max
  
  // Pre-compute all rates and times
  const arrivalRates_s = new Float32Array(numFloors + 1);
  const departureRates_s = new Float32Array(numFloors + 1);
  const travelTimes = new Float32Array(numFloors + 1);
  
  for (let f = 1; f <= numFloors; f++) {
    arrivalRates_s[f] = (arrivalRates[f] || 0) / 3600.0;
    departureRates_s[f] = (departureRates[f] || 0) / 3600.0;
    travelTimes[f] = Math.abs(f - lobbyFloor) * verticalSpeed;
  }
  
  const rng = new FastRNG(seed * 12345 + 67890);
  const eventQueue = new FastQueue();
  
  // Simplified state tracking
  let currentFloor = lobbyFloor;
  let state = 0; // 0=idle, 1=moving, 2=loading, 3=traveling, 4=unloading
  let passenger = null;
  
  // Minimal queue tracking - only track lengths, not full passenger objects
  const queueLengths = new Uint32Array(numFloors + 1);
  const queueTimes = new Float32Array(numFloors + 1); // Last change times
  const queueHist = Array.from({length: numFloors + 1}, () => ({}));
  
  // Counters
  let served = 0;
  let totalWaitTime = 0;
  let totalServiceTime = 0;
  let idleTime = 0;
  let lastStateTime = 0;
  
  // Reduced metrics - only track essential data
  const waitTimesByFloor = new Array(numFloors + 1).fill().map(() => []);
  const serviceTimesByFloor = new Array(numFloors + 1).fill().map(() => []);
  
  function updateQueueHist(time) {
    for (let f = 1; f <= numFloors; f++) {
      const dt = time - queueTimes[f];
      if (dt > 0) {
        const len = queueLengths[f];
        queueHist[f][len] = (queueHist[f][len] || 0) + dt;
      }
      queueTimes[f] = time;
    }
  }
  
  function scheduleNextArrival(floor, isUpward, lastTime) {
    const rate = isUpward ? arrivalRates_s[floor] : departureRates_s[floor];
    if (rate > 0) {
      const interval = Math.max(rng.exponential(rate), minHeadway);
      const nextTime = lastTime + interval;
      if (nextTime <= simTime) {
        const origin = isUpward ? lobbyFloor : floor;
        const dest = isUpward ? floor : lobbyFloor;
        eventQueue.push(nextTime, 'arrival', { origin, dest, arrivalTime: nextTime });
      }
    }
  }
  
  // Initialize arrival streams
  for (let f = 1; f <= numFloors; f++) {
    if (f === lobbyFloor) continue;
    scheduleNextArrival(f, true, 0);  // Upward
    scheduleNextArrival(f, false, 0); // Downward
  }
  
  let time = 0;
  let eventCount = 0;
  const maxEvents = Math.min(simTime * 20, 100000); // Reduced event limit
  
  while (!eventQueue.isEmpty() && time <= simTime && eventCount < maxEvents) {
    const evt = eventQueue.pop();
    if (!evt) break;
    
    const dt = evt.time - time;
    if (state === 0) idleTime += dt; // Track idle time
    
    time = evt.time;
    eventCount++;
    
    updateQueueHist(time);
    
    if (evt.type === 'arrival') {
      const p = evt.data;
      queueLengths[p.origin]++;
      
      // Schedule next arrival
      if (p.origin === lobbyFloor) {
        scheduleNextArrival(p.dest, true, time);
      } else {
        scheduleNextArrival(p.origin, false, time);
      }
      
      // If idle, start pickup
      if (state === 0) {
        const targetFloor = findBestFloor();
        if (targetFloor !== null && targetFloor !== currentFloor) {
          state = 1; // moving
          eventQueue.push(time + travelTimes[targetFloor], 'arrive_at_floor', { floor: targetFloor });
        } else if (targetFloor === currentFloor && queueLengths[currentFloor] > 0) {
          state = 2; // loading
          eventQueue.push(time + doorOpenTime + enterTime, 'loaded');
        }
      }
    }
    
    else if (evt.type === 'arrive_at_floor') {
      currentFloor = evt.data.floor;
      if (queueLengths[currentFloor] > 0) {
        state = 2; // loading
        eventQueue.push(time + doorOpenTime + enterTime, 'loaded');
      } else {
        state = 0; // idle
      }
    }
    
    else if (evt.type === 'loaded') {
      queueLengths[currentFloor]--;
      const dest = currentFloor === lobbyFloor ? findRandomDestination() : lobbyFloor;
      passenger = { origin: currentFloor, dest, boardTime: time };
      
      if (dest !== currentFloor) {
        state = 3; // traveling
        const travelTime = travelTimes[dest];
        eventQueue.push(time + doorCloseTime + travelTime, 'arrived_at_dest');
      } else {
        // Same floor - immediate exit
        eventQueue.push(time + doorCloseTime + exitTime, 'unloaded');
      }
    }
    
    else if (evt.type === 'arrived_at_dest') {
      currentFloor = passenger.dest;
      state = 4; // unloading
      eventQueue.push(time + doorOpenTime + exitTime, 'unloaded');
    }
    
    else if (evt.type === 'unloaded') {
      // Record metrics
      served++;
      const waitTime = passenger.boardTime - passenger.arrivalTime;
      const serviceTime = time - passenger.boardTime;
      
      totalWaitTime += waitTime;
      totalServiceTime += serviceTime;
      
      // Store for floor-specific averages (sample only to save memory)
      if (waitTimesByFloor[passenger.origin].length < 1000) {
        waitTimesByFloor[passenger.origin].push(waitTime);
      }
      if (serviceTimesByFloor[passenger.origin].length < 1000) {
        serviceTimesByFloor[passenger.origin].push(serviceTime);
      }
      
      passenger = null;
      
      // Continue with next passenger or go idle
      if (queueLengths[currentFloor] > 0) {
        state = 2; // loading
        eventQueue.push(time + enterTime, 'loaded');
      } else {
        const nextFloor = findBestFloor();
        if (nextFloor !== null && nextFloor !== currentFloor) {
          state = 1; // moving
          eventQueue.push(time + doorCloseTime + travelTimes[nextFloor], 'arrive_at_floor', { floor: nextFloor });
        } else {
          state = 0; // idle
        }
      }
    }
  }
  
  function findBestFloor() {
    let bestFloor = null;
    let minDist = Infinity;
    for (let f = 1; f <= numFloors; f++) {
      if (queueLengths[f] > 0) {
        const dist = Math.abs(f - currentFloor);
        if (dist < minDist) {
          minDist = dist;
          bestFloor = f;
        }
      }
    }
    return bestFloor;
  }
  
  function findRandomDestination() {
    // Simple random destination for upward traffic
    const floors = [];
    for (let f = 1; f <= numFloors; f++) {
      if (f !== lobbyFloor) floors.push(f);
    }
    return floors[Math.floor(rng.next() * floors.length)];
  }
  
  updateQueueHist(time);
  
  const utilization = time > 0 ? ((time - idleTime) / time) * 100 : 0;
  
  return {
    simHours: time / 3600,
    served,
    utilizationRate: utilization,
    actualArrivalRate: served / (time / 3600),
    avgWaitTime: served > 0 ? totalWaitTime / served : 0,
    avgServiceTime: served > 0 ? totalServiceTime / served : 0,
    waitTimesByFloor,
    serviceTimesByFloor,
    queueHist,
    numFloors,
    lobbyFloor
  };
}

function averageCarLiftResults(results) {
  if (results.length === 0) return null;
  
  const first = results[0];
  const n = results.length;
  
  // Simple averaging - no complex calculations
  const avgResult = {
    simHours: first.simHours,
    numFloors: first.numFloors,
    lobbyFloor: first.lobbyFloor,
    numSeeds: n,
    served: results.reduce((sum, r) => sum + r.served, 0) / n,
    utilizationRate: results.reduce((sum, r) => sum + r.utilizationRate, 0) / n,
    actualArrivalRate: results.reduce((sum, r) => sum + r.actualArrivalRate, 0) / n,
    avgWaitTime: results.reduce((sum, r) => sum + r.avgWaitTime, 0) / n,
    avgServiceTime: results.reduce((sum, r) => sum + r.avgServiceTime, 0) / n,
    
    // Simplified floor-based metrics
    avgWaitTimesByFloor: {},
    avgServiceTimesByFloor: {},
    avgQueueStats: {}
  };
  
  // Average wait times by floor
  for (let f = 1; f <= first.numFloors; f++) {
    const allWaitTimes = results.flatMap(r => r.waitTimesByFloor[f] || []);
    avgResult.avgWaitTimesByFloor[f] = allWaitTimes.length > 0 
      ? allWaitTimes.reduce((sum, time) => sum + time, 0) / allWaitTimes.length 
      : 0;
      
    const allServiceTimes = results.flatMap(r => r.serviceTimesByFloor[f] || []);
    avgResult.avgServiceTimesByFloor[f] = allServiceTimes.length > 0 
      ? allServiceTimes.reduce((sum, time) => sum + time, 0) / allServiceTimes.length 
      : 0;
  }
  
  // Simplified queue statistics
  for (let f = 1; f <= first.numFloors; f++) {
    const avgHist = {};
    for (const result of results) {
      const hist = result.queueHist[f] || {};
      for (const [qLen, time] of Object.entries(hist)) {
        avgHist[qLen] = (avgHist[qLen] || 0) + time;
      }
    }
    if (Object.keys(avgHist).length > 0) {
      avgResult.avgQueueStats[f] = avgHist;
    }
  }
  
  return avgResult;
}