export default async function handler(req, res) {
  // Authentication is handled by the Lambda wrapper (simulation-wrapper.js)

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, parameters } = req.body;

  try {
    if (action === 'runSimulation') {
      const startTime = Date.now();
      const results = await runMultipleCarLiftSimulations(parameters);
      const executionTimeMs = Date.now() - startTime;

      console.log(`Car Lift simulation completed in ${executionTimeMs}ms`);
      res.json({ success: true, results, executionTimeMs });
    } else if (action === 'validateCapacity') {
      const validation = validateElevatorCapacity(parameters);
      res.json({ success: true, validation });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Simulation failed: ' + error.message });
  }
}

// Optimized Binary Heap Priority Queue
class BinaryHeap {
  constructor() {
    this.heap = [];
    this.size = 0;
  }
  
  push(event) {
    this.heap[this.size] = event;
    this._bubbleUp(this.size);
    this.size++;
  }
  
  pop() {
    if (this.size === 0) return null;
    
    const root = this.heap[0];
    this.size--;
    
    if (this.size > 0) {
      this.heap[0] = this.heap[this.size];
      this._bubbleDown(0);
    }
    
    return root;
  }
  
  isEmpty() {
    return this.size === 0;
  }
  
  _bubbleUp(index) {
    const element = this.heap[index];
    
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];
      
      if (element.time >= parent.time) break;
      
      this.heap[index] = parent;
      index = parentIndex;
    }
    
    this.heap[index] = element;
  }
  
  _bubbleDown(index) {
    const element = this.heap[index];
    const halfSize = Math.floor(this.size / 2);
    
    while (index < halfSize) {
      let leftChild = 2 * index + 1;
      let rightChild = leftChild + 1;
      let smallest = leftChild;
      
      if (rightChild < this.size && this.heap[rightChild].time < this.heap[leftChild].time) {
        smallest = rightChild;
      }
      
      if (this.heap[smallest].time >= element.time) break;
      
      this.heap[index] = this.heap[smallest];
      index = smallest;
    }
    
    this.heap[index] = element;
  }
}

class Event {
  constructor(time, eventType, passenger = null, targetFloor = null) {
    this.time = time;
    this.eventType = eventType;
    this.passenger = passenger;
    this.targetFloor = targetFloor;
  }
}

class Passenger {
  constructor(origin, destination, arrivalTime, id) {
    this.origin = origin;
    this.destination = destination;
    this.arrivalTime = arrivalTime;
    this.boardTime = null;
    this.exitTime = null;
    this.id = id;
  }
}

class Elevator {
  constructor(lobbyFloor) {
    this.currentFloor = lobbyFloor;
    this.direction = 1;
    this.state = "IDLE";
    this.passenger = null;
    this.targetFloor = null;
    this.stateStartTime = 0;
  }
}

// Optimized random number generator with lookup table
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
    // Pre-compute exponential lookup table for better performance
    this.expLookup = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) {
      this.expLookup[i] = -Math.log((i + 0.5) / 1000);
    }
  }
  
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  
  exponential(rate) {
    const index = Math.floor(this.next() * 1000);
    return this.expLookup[index] / rate;
  }
}

function validateElevatorCapacity(parameters) {
  const { numFloors, lobbyFloor, doorOpenTime, doorCloseTime, enterTime, 
          exitTime, verticalSpeed, bufferTime, arrivalRates, departureRates } = parameters;

  const floorData = [];
  let totalArrivalRate = 0;
  let totalDepartureRate = 0;
  
  // Collect data for each floor
  for (let f = 1; f <= numFloors; f++) {
    if (f === lobbyFloor) continue;
    
    const arrivalRate = arrivalRates[f] || 0;
    const departureRate = departureRates[f] || 0;
    const distance = Math.abs(f - lobbyFloor);
    
    floorData.push({
      floor: f,
      arrivals: arrivalRate,
      departures: departureRate,
      distance: distance
    });
    
    totalArrivalRate += arrivalRate;
    totalDepartureRate += departureRate;
  }
  
  // MAXIMUM utilization: worst case with round trips
  let maxUtilization = 0;
  for (const floor of floorData) {
    const totalRate = floor.arrivals + floor.departures;
    const maxTimePerTrip = enterTime + 2*doorCloseTime + 2*bufferTime + 
                         2*verticalSpeed*floor.distance + 2*doorOpenTime + exitTime;
    maxUtilization += totalRate * maxTimePerTrip;
  }
  maxUtilization = (maxUtilization / 3600) * 100;
  
  // MINIMUM utilization: optimal batching
  let minUtilization = 0;
  
  // Check if all floors have balanced traffic
  const allBalanced = floorData.every(floor => floor.arrivals === floor.departures);
  
  if (allBalanced) {
    // Simple case: perfect batching possible everywhere
    for (const floor of floorData) {
      const totalRate = floor.arrivals + floor.departures;
      const minTimePerTrip = enterTime + doorCloseTime + bufferTime + 
                           verticalSpeed*floor.distance + doorOpenTime + exitTime;
      minUtilization += totalRate * minTimePerTrip;
    }
  } else {
    // Complex case: four-term calculation
    
    // Term 1: Balanced portion (2x rate for batched trips)
    let term1 = 0;
    for (const floor of floorData) {
      const balancedRate = 2 * Math.min(floor.arrivals, floor.departures);
      const timePerTrip = enterTime + doorCloseTime + bufferTime + 
                        verticalSpeed*floor.distance + doorOpenTime + exitTime;
      term1 += balancedRate * timePerTrip;
    }
    
    // Term 2: Imbalanced portion (single direction trips)
    let term2 = 0;
    for (const floor of floorData) {
      const imbalancedRate = Math.abs(floor.arrivals - floor.departures);
      const timePerTrip = enterTime + doorCloseTime + bufferTime + 
                        verticalSpeed*floor.distance + doorOpenTime + exitTime;
      term2 += imbalancedRate * timePerTrip;
    }
    
    // Term 3 & 4: Cross-floor balancing
    let excessArrivals = 0;
    let excessDepartures = 0;
    let weightedArrivalLevel = 0;
    let weightedDepartureLevel = 0;
    
    for (const floor of floorData) {
      const arrivalExcess = Math.max(0, floor.arrivals - floor.departures);
      const departureExcess = Math.max(0, floor.departures - floor.arrivals);
      
      excessArrivals += arrivalExcess;
      excessDepartures += departureExcess;
      weightedArrivalLevel += arrivalExcess * floor.floor;
      weightedDepartureLevel += departureExcess * floor.floor;
    }
    
    const avgArrivalLevel = excessArrivals > 0 ? weightedArrivalLevel / excessArrivals : lobbyFloor;
    const avgDepartureLevel = excessDepartures > 0 ? weightedDepartureLevel / excessDepartures : lobbyFloor;
    
    // Term 3: Cross-floor matching
    const term3Rate = Math.min(excessArrivals, excessDepartures);
    const term3Time = Math.abs(avgDepartureLevel - avgArrivalLevel) * verticalSpeed + 
                    doorCloseTime + bufferTime + doorOpenTime;
    const term3 = term3Rate * term3Time;
    
    // Term 4: Remaining imbalance
    const term4Rate = Math.abs(excessArrivals - excessDepartures);
    const greaterExcessLevel = excessArrivals > excessDepartures ? avgArrivalLevel : avgDepartureLevel;
    const term4Time = Math.abs(greaterExcessLevel - lobbyFloor) * verticalSpeed + 
                    doorCloseTime + bufferTime + doorOpenTime;
    const term4 = term4Rate * term4Time;
    
    minUtilization = (term1 + term2 + term3 + term4);
  }
  
  minUtilization = (minUtilization / 3600) * 100;
  
  return {
    minimum: minUtilization,
    maximum: maxUtilization,
    capacityExceeded: minUtilization > 100,
    maxExceedsCapacity: maxUtilization > 100
  };
}

async function runMultipleCarLiftSimulations(parameters) {
  const numSeeds = parameters.numSeeds || 100;
  const first = parameters;
  
  // Running totals for memory efficiency
  let totalServed = 0;
  let totalUtilizationRate = 0;
  let totalBusyProbability = 0;
  let totalActualArrivalRate = 0;
  let totalSimHours = 0;
  
  // Running totals for state tracking
  const totalStateTime = {
    'IDLE': 0.0,
    'DOORS_OPENING': 0.0,
    'LOADING': 0.0,
    'DOORS_CLOSING': 0.0,
    'MOVING': 0.0,
    'TRAVELING': 0.0,
    'EXITING': 0.0,
    'LEVELING_BUFFER': 0.0
  };
  
  // Running totals for wait/service times by floor
  const waitTimeTotalsByFloor = {};
  const waitTimeCountsByFloor = {};
  const serviceTimeTotalsByFloor = {};
  const serviceTimeCountsByFloor = {};
  const exitWaitingTotalsByFloor = {};
  const processedTotalsByFloor = {};
  
  // Preserve queue histograms (as requested)
  const accumulatedQueueHist = Array.from({length: first.numFloors + 1}, () => ({}));
  
  // Track hourly maximum distributions per floor
  const accumulatedHourlyMaxDist = Array.from({length: first.numFloors + 1}, () => ({}));
  
  for (let f = 1; f <= first.numFloors; f++) {
    waitTimeTotalsByFloor[f] = 0;
    waitTimeCountsByFloor[f] = 0;
    serviceTimeTotalsByFloor[f] = 0;
    serviceTimeCountsByFloor[f] = 0;
    exitWaitingTotalsByFloor[f] = 0;
    processedTotalsByFloor[f] = 0;
  }
  
  // Process in smaller batches to avoid memory issues
  const batchSize = 1;
  for (let start = 0; start < numSeeds; start += batchSize) {
    const end = Math.min(start + batchSize, numSeeds);
    
    for (let seed = start; seed < end; seed++) {
      const result = simulateCarLiftOptimized(seed, parameters);
      
      // Accumulate basic metrics
      totalServed += result.served;
      totalUtilizationRate += result.utilizationRate;
      totalBusyProbability += result.busyProbability;
      totalActualArrivalRate += result.actualArrivalRate;
      totalSimHours += result.simHours;
      
      // Accumulate state times
      for (const state in totalStateTime) {
        totalStateTime[state] += result.stateTimeTracking[state] || 0;
      }
      
      // Accumulate wait/service times by floor
      for (let f = 1; f <= first.numFloors; f++) {
        if (result.waitTimesByOrigin[f]) {
          const floorWaitTimes = result.waitTimesByOrigin[f];
          waitTimeTotalsByFloor[f] += floorWaitTimes.reduce((sum, time) => sum + time, 0);
          waitTimeCountsByFloor[f] += floorWaitTimes.length;
        }
        
        if (result.serviceTimesByOrigin[f]) {
          const floorServiceTimes = result.serviceTimesByOrigin[f];
          serviceTimeTotalsByFloor[f] += floorServiceTimes.reduce((sum, time) => sum + time, 0);
          serviceTimeCountsByFloor[f] += floorServiceTimes.length;
        }
        
        exitWaitingTotalsByFloor[f] += result.exitWithWaitingByFloor[f] || 0;
        processedTotalsByFloor[f] += result.processedByFloor[f] || 0;
      }
      
      // Accumulate queue histograms (preserve as requested)
      for (let f = 1; f <= first.numFloors; f++) {
        const hist = result.queueHist[f] || {};
        for (const [qLen, time] of Object.entries(hist)) {
          accumulatedQueueHist[f][qLen] = (accumulatedQueueHist[f][qLen] || 0) + time;
        }
        
        // Accumulate hourly max distributions
        const hourlyMaxDist = result.hourlyMaxDistributions[f] || {};
        for (const [maxVal, count] of Object.entries(hourlyMaxDist)) {
          accumulatedHourlyMaxDist[f][maxVal] = (accumulatedHourlyMaxDist[f][maxVal] || 0) + count;
        }
      }
    }
    
    // Allow event loop to breathe between batches
    if (start + batchSize < numSeeds) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  
  // Calculate final averages
  const avgResult = {
    simHours: totalSimHours / numSeeds,
    numFloors: first.numFloors,
    lobbyFloor: first.lobbyFloor,
    numSeeds: numSeeds,
    
    // Averaged metrics
    served: totalServed / numSeeds,
    utilizationRate: totalUtilizationRate / numSeeds,
    busyProbability: totalBusyProbability / numSeeds,
    actualArrivalRate: totalActualArrivalRate / numSeeds,
    
    // Exit-waiting encounter percentages by floor
    exitWaitingPercentagesByFloor: {},
    
    // Averaged wait and service times
    avgWaitTimesByFloor: {},
    avgServiceTimesByFloor: {},
    
    // State time tracking (averaged)
    stateTimeTracking: {},
    
    // Queue statistics (preserved as requested)
    avgQueueStats: {}
  };
  
  // Calculate exit-waiting percentages by floor
  for (let f = 1; f <= first.numFloors; f++) {
    avgResult.exitWaitingPercentagesByFloor[f] = processedTotalsByFloor[f] > 0 
      ? (exitWaitingTotalsByFloor[f] / processedTotalsByFloor[f]) * 100 
      : 0;
  }
  
  // Calculate average wait and service times by floor
  for (let f = 1; f <= first.numFloors; f++) {
    avgResult.avgWaitTimesByFloor[f] = waitTimeCountsByFloor[f] > 0 
      ? waitTimeTotalsByFloor[f] / waitTimeCountsByFloor[f] 
      : 0;
      
    avgResult.avgServiceTimesByFloor[f] = serviceTimeCountsByFloor[f] > 0 
      ? serviceTimeTotalsByFloor[f] / serviceTimeCountsByFloor[f] 
      : 0;
  }
  
  // Calculate overall average wait and service times
  const totalWaitTimeCount = Object.values(waitTimeCountsByFloor).reduce((sum, count) => sum + count, 0);
  const totalWaitTimeSum = Object.values(waitTimeTotalsByFloor).reduce((sum, total) => sum + total, 0);
  const totalServiceTimeSum = Object.values(serviceTimeTotalsByFloor).reduce((sum, total) => sum + total, 0);
  
  avgResult.avgWaitTime = totalWaitTimeCount > 0 ? totalWaitTimeSum / totalWaitTimeCount : 0;
  avgResult.avgServiceTime = totalWaitTimeCount > 0 ? totalServiceTimeSum / totalWaitTimeCount : 0;
  
  // Average state tracking
  for (const state in totalStateTime) {
    avgResult.stateTimeTracking[state] = totalStateTime[state] / numSeeds;
  }
  
  // Average queue statistics (preserved as requested)
  for (let f = 1; f <= first.numFloors; f++) {
    if (Object.keys(accumulatedQueueHist[f]).length > 0) {
      const avgHist = {};
      for (const [qLen, time] of Object.entries(accumulatedQueueHist[f])) {
        avgHist[qLen] = time / numSeeds;
      }
      avgResult.avgQueueStats[f] = avgHist;
    }
  }
  
  // Calculate hourly maximum distributions (percentage of hours)
  avgResult.hourlyMaxDistributions = {};
  for (let f = 1; f <= first.numFloors; f++) {
    if (Object.keys(accumulatedHourlyMaxDist[f]).length > 0) {
      const totalHours = avgResult.simHours * numSeeds;
      const maxDist = {};
      
      for (const [maxVal, count] of Object.entries(accumulatedHourlyMaxDist[f])) {
        maxDist[maxVal] = {
          avg: (count / totalHours) * 100
        };
      }
      
      avgResult.hourlyMaxDistributions[f] = maxDist;
    }
  }
  
  return avgResult;
}

function simulateCarLiftOptimized(seed, parameters) {
  const { numFloors, lobbyFloor, simHours, doorOpenTime, enterTime, doorCloseTime, 
          verticalSpeed, exitTime, bufferTime, minHeadway, arrivalRates, departureRates } = parameters;
          
  const simTime = simHours * 3600.0;
  
  // Pre-cache rates (convert to per-second)
  const arrivalRateUp = new Float32Array(numFloors + 1);
  const departureRateDown = new Float32Array(numFloors + 1);
  
  for (let f = 1; f <= numFloors; f++) {
    if (f === lobbyFloor) continue;
    arrivalRateUp[f] = (arrivalRates[f] || 0) / 3600.0;
    departureRateDown[f] = (departureRates[f] || 0) / 3600.0;
  }
  
  // Pre-compute travel time lookup table (pure movement time only)
  const travelTimeCache = new Array(numFloors + 1);
  for (let i = 0; i <= numFloors; i++) {
    travelTimeCache[i] = new Float32Array(numFloors + 1);
    for (let j = 0; j <= numFloors; j++) {
      travelTimeCache[i][j] = Math.abs(i - j) * verticalSpeed;
    }
  }
  
  const rng = new SeededRandom(seed * 12345 + 67890);
  
  const elevator = new Elevator(lobbyFloor);
  const eventQueue = new BinaryHeap();
  
  // Optimized queue management with pre-allocated arrays
  const floorQueues = new Array(numFloors + 1);
  const queueHeads = new Int32Array(numFloors + 1);
  const queueTails = new Int32Array(numFloors + 1);
  
  for (let i = 0; i <= numFloors; i++) {
    floorQueues[i] = new Array(1000); // Pre-allocate
    queueHeads[i] = 0;
    queueTails[i] = 0;
  }
  
  const queueHist = Array.from({length: numFloors + 1}, () => ({}));
  const queueLastChangeTime = new Float32Array(numFloors + 1);
  const served = [];
  const waitTimesByOrigin = {};
  const serviceTimesByOrigin = {};

  // Track hourly maximum queue lengths per floor
  const hourlyMaxQueueLength = Array.from({length: numFloors + 1}, () => ({}));
  const currentHourMaxQueue = new Int32Array(numFloors + 1);
  let currentHour = 0;

  const arrivalsByFloor = new Int32Array(numFloors + 1);
  const processedByFloor = new Int32Array(numFloors + 1);
  let nextPassengerId = 1;
  let arrivalCount = 0;
  let arrivalsWhenIdle = 0;
  let exitWithWaitingCount = 0;
  let exitWithWaitingByFloor = new Int32Array(numFloors + 1);
  
  let stateTimeTracking = {
    'IDLE': 0.0,
    'DOORS_OPENING': 0.0,
    'LOADING': 0.0,
    'DOORS_CLOSING': 0.0,
    'MOVING': 0.0,
    'TRAVELING': 0.0,
    'EXITING': 0.0,
    'LEVELING_BUFFER': 0.0
  };
  let lastStateChangeTime = 0.0;
  
  // Fast queue operations
  function enqueuePassenger(floor, passenger) {
    const tail = queueTails[floor];
    floorQueues[floor][tail] = passenger;
    queueTails[floor] = tail + 1;
    sampleQueues(passenger.arrivalTime);
  }
  
  function dequeuePassenger(floor) {
    if (queueHeads[floor] >= queueTails[floor]) return null;
    const passenger = floorQueues[floor][queueHeads[floor]];
    queueHeads[floor]++;
    return passenger;
  }
  
  function getQueueLength(floor) {
    return queueTails[floor] - queueHeads[floor];
  }
  
  function trackStateChange(currentTime, newState) {
    const timeInPreviousState = currentTime - lastStateChangeTime;
    if (elevator.state in stateTimeTracking) {
      stateTimeTracking[elevator.state] += timeInPreviousState;
    }
    elevator.state = newState;
    lastStateChangeTime = currentTime;
  }
  
  function travelTime(a, b) {
    return travelTimeCache[a][b];
  }
  
  function scheduleNextArrivalForFloor(destFloor, lastArrivalTime) {
    const rate = arrivalRateUp[destFloor];
    if (rate > 0) {
      const exponentialInterval = rng.exponential(rate);
      const actualInterval = Math.max(exponentialInterval, minHeadway);
      const t = lastArrivalTime + actualInterval;
      if (t <= simTime) {
        const p = new Passenger(lobbyFloor, destFloor, t, nextPassengerId++);
        eventQueue.push(new Event(t, "passenger_arrival", p));
      }
    }
  }

  function scheduleNextDepartureForFloor(originFloor, lastArrivalTime) {
    const rate = departureRateDown[originFloor];
    if (rate > 0) {
      const exponentialInterval = rng.exponential(rate);
      const actualInterval = Math.max(exponentialInterval, minHeadway);
      const t = lastArrivalTime + actualInterval;
      if (t <= simTime) {
        const p = new Passenger(originFloor, lobbyFloor, t, nextPassengerId++);
        eventQueue.push(new Event(t, "passenger_arrival", p));
      }
    }
  }
  
  function sampleQueues(currentTime) {
    // Check if we've moved to a new hour
    const newHour = Math.floor(currentTime / 3600);
    if (newHour > currentHour) {
      // Record maximums for the previous hour
      for (let f = 1; f <= numFloors; f++) {
        const maxQueue = currentHourMaxQueue[f];
        hourlyMaxQueueLength[f][maxQueue] = (hourlyMaxQueueLength[f][maxQueue] || 0) + 1;
        currentHourMaxQueue[f] = 0;
      }
      currentHour = newHour;
    }
    
    for (let f = 1; f <= numFloors; f++) {
      const queueLength = getQueueLength(f);
      const timeDelta = currentTime - queueLastChangeTime[f];
      
      if (timeDelta > 0) {
        queueHist[f][queueLength] = (queueHist[f][queueLength] || 0) + timeDelta;
      }
      queueLastChangeTime[f] = currentTime;
      
      // Update hourly maximum
      if (queueLength > currentHourMaxQueue[f]) {
        currentHourMaxQueue[f] = queueLength;
      }
    }
  }
  
  function findNearestRequestFloor() {
    let bestFloor = null;
    let minDistance = Infinity;
    
    for (let f = 1; f <= numFloors; f++) {
      if (getQueueLength(f) > 0) {
        const distance = Math.abs(f - elevator.currentFloor);
        if (distance < minDistance) {
          minDistance = distance;
          bestFloor = f;
        }
      }
    }
    
    return bestFloor;
  }
  
  function beginPickup(currentTime, floor) {
    if (getQueueLength(floor) === 0) {
      return false;
    }
    
    if (elevator.state !== "IDLE") {
      return false;
    }
    
    trackStateChange(currentTime, "DOORS_OPENING");
    elevator.stateStartTime = currentTime;
    elevator.targetFloor = floor;
    
    eventQueue.push(new Event(currentTime + doorOpenTime, "doors_opened"));
    return true;
  }
  
  function beginMove(currentTime, targetFloor) {
    if (elevator.currentFloor === targetFloor) {
      return beginPickup(currentTime, targetFloor);
    }
    
    trackStateChange(currentTime, "MOVING");
    elevator.stateStartTime = currentTime;
    elevator.targetFloor = targetFloor;
    
    const moveTime = travelTimeCache[elevator.currentFloor][targetFloor];
    
    eventQueue.push(new Event(currentTime + moveTime, "move_completed", null, targetFloor));
    return true;
  }
  
  // Initialize arrival streams
  for (let f = 1; f <= numFloors; f++) {
    if (f === lobbyFloor) continue;
    scheduleNextArrivalForFloor(f, 0.0);
    scheduleNextDepartureForFloor(f, 0.0);
  }
  
  let time = 0.0;
  lastStateChangeTime = 0.0;
  let eventCount = 0;
  const maxEvents = Math.min(simTime * 50, 5000000);
  
  while (!eventQueue.isEmpty() && time <= simTime && eventCount < maxEvents) {
    const evt = eventQueue.pop();
    
    time = evt.time;
    eventCount++;
    
    sampleQueues(time);
    
    if (evt.eventType === "passenger_arrival") {
      const p = evt.passenger;
      enqueuePassenger(p.origin, p);
      arrivalCount++;
      arrivalsByFloor[p.origin]++;
      
      if (elevator.state === "IDLE") {
        arrivalsWhenIdle++;
      }

      if (p.origin === lobbyFloor) {
        scheduleNextArrivalForFloor(p.destination, p.arrivalTime);
      } else {
        scheduleNextDepartureForFloor(p.origin, p.arrivalTime);
      }

      if (elevator.state === "IDLE") {
        const targetFloor = findNearestRequestFloor();
        if (targetFloor !== null) {
          beginMove(time, targetFloor);
        }
      }
      
    } else if (evt.eventType === "move_completed") {
      if (elevator.state !== "MOVING") {
        continue;
      }
      
      elevator.currentFloor = evt.targetFloor;
      trackStateChange(time, "LEVELING_BUFFER");
      
      eventQueue.push(new Event(time + bufferTime, "leveling_completed", null, evt.targetFloor));
      
    } else if (evt.eventType === "leveling_completed") {
      if (elevator.state !== "LEVELING_BUFFER") {
        continue;
      }
      
      trackStateChange(time, "IDLE");
      
      if (getQueueLength(elevator.currentFloor) > 0) {
        beginPickup(time, elevator.currentFloor);
      } else {
        // Check if we need to move somewhere else after leveling
        const nextTarget = findNearestRequestFloor();
        if (nextTarget !== null) {
          beginMove(time, nextTarget);
        } else if (elevator.currentFloor !== lobbyFloor) {
          beginMove(time, lobbyFloor);
        }
        // If no requests and already at lobby, stay idle
      }
      
    } else if (evt.eventType === "doors_opened") {
      if (elevator.state !== "DOORS_OPENING") {
        continue;
      }
      
      if (getQueueLength(elevator.currentFloor) > 0) {
        const p = dequeuePassenger(elevator.currentFloor);
        p.boardTime = time;
        elevator.passenger = p;
        trackStateChange(time, "LOADING");
        sampleQueues(time);
        
        const loadingTime = enterTime;
        eventQueue.push(new Event(time + loadingTime, "loading_completed"));
      } else {
        trackStateChange(time, "DOORS_CLOSING");
        eventQueue.push(new Event(time + doorCloseTime, "doors_closed_empty"));
      }
      
    } else if (evt.eventType === "loading_completed") {
      if (elevator.state !== "LOADING" || elevator.passenger === null) {
        continue;
      }
      
      trackStateChange(time, "DOORS_CLOSING");
      eventQueue.push(new Event(time + doorCloseTime, "doors_closed"));
      
    } else if (evt.eventType === "doors_closed") {
      if (elevator.state !== "DOORS_CLOSING" || elevator.passenger === null) {
        continue;
      }
      
      if (elevator.passenger.destination === elevator.currentFloor) {
        // Same floor - immediate exit without travel/leveling
        trackStateChange(time, "EXITING");
        eventQueue.push(new Event(time + exitTime, "exiting_completed"));
      } else {
        // Different floor - travel then level
        trackStateChange(time, "TRAVELING");
        const travelTime = travelTimeCache[elevator.currentFloor][elevator.passenger.destination];
        eventQueue.push(new Event(time + travelTime, "trip_completed"));
      }
      
    } else if (evt.eventType === "doors_closed_empty") {
      if (elevator.state !== "DOORS_CLOSING") {
        continue;
      }
      
      trackStateChange(time, "IDLE");
      
      const nextTarget = findNearestRequestFloor();
      if (nextTarget !== null) {
        beginMove(time, nextTarget);
      } else if (elevator.currentFloor !== lobbyFloor) {
        beginMove(time, lobbyFloor);
      }
      
    } else if (evt.eventType === "trip_completed") {
      if (elevator.state !== "TRAVELING" || elevator.passenger === null) {
        continue;
      }
      
      elevator.currentFloor = elevator.passenger.destination;
      trackStateChange(time, "LEVELING_BUFFER");
      
      eventQueue.push(new Event(time + bufferTime, "dest_leveling_completed"));
      
    } else if (evt.eventType === "dest_leveling_completed") {
      if (elevator.state !== "LEVELING_BUFFER") {
        continue;
      }
      
      trackStateChange(time, "DOORS_OPENING");
      
      eventQueue.push(new Event(time + doorOpenTime, "arrival_doors_opened"));
      
    } else if (evt.eventType === "arrival_doors_opened") {
      if (elevator.state !== "DOORS_OPENING") {
        continue;
      }
      
      trackStateChange(time, "EXITING");
      eventQueue.push(new Event(time + exitTime, "exiting_completed"));
      
    } else if (evt.eventType === "exiting_completed") {
      if (elevator.state !== "EXITING") {
        continue;
      }
      
      const p = elevator.passenger;
      p.exitTime = time;
      served.push(p);
      processedByFloor[p.origin]++;
      
      // Count when passenger exits and there's someone waiting at this floor
      if (getQueueLength(elevator.currentFloor) > 0) {
        exitWithWaitingCount++;
        exitWithWaitingByFloor[elevator.currentFloor]++;
      }
      
      elevator.passenger = null;
      
      // Keep doors open optimization: if passengers are waiting at current floor,
      // skip the door closing/opening cycle and load immediately
      if (getQueueLength(elevator.currentFloor) > 0) {
        // Load next passenger immediately - doors stay open
        const nextPassenger = dequeuePassenger(elevator.currentFloor);
        nextPassenger.boardTime = time;
        elevator.passenger = nextPassenger;
        
        trackStateChange(time, "LOADING");
        sampleQueues(time);
        
        const loadingTime = enterTime;
        eventQueue.push(new Event(time + loadingTime, "loading_completed"));
        
      } else {
        // No one waiting - proceed with normal door closing
        trackStateChange(time, "DOORS_CLOSING");
        eventQueue.push(new Event(time + doorCloseTime, "arrival_doors_closed"));
      }
      
    } else if (evt.eventType === "arrival_doors_closed") {
      if (elevator.state !== "DOORS_CLOSING") {
        continue;
      }
      
      trackStateChange(time, "IDLE");
      
      // Check if passengers arrived while doors were closing
      if (getQueueLength(elevator.currentFloor) > 0) {
        beginPickup(time, elevator.currentFloor);
      } else {
        const nextTarget = findNearestRequestFloor();
        if (nextTarget !== null) {
          beginMove(time, nextTarget);
        } else if (elevator.currentFloor !== lobbyFloor) {
          beginMove(time, lobbyFloor);
        }
      }
    }
  }
  
  // Final state tracking
  const timeInFinalState = time - lastStateChangeTime;
  if (elevator.state in stateTimeTracking) {
    stateTimeTracking[elevator.state] += timeInFinalState;
  }
  
  sampleQueues(time);
  
  // Record final hour maximums
  for (let f = 1; f <= numFloors; f++) {
    const maxQueue = currentHourMaxQueue[f];
    hourlyMaxQueueLength[f][maxQueue] = (hourlyMaxQueueLength[f][maxQueue] || 0) + 1;
  }
  
  for (const p of served) {
    if (p.boardTime !== null) {
      if (!waitTimesByOrigin[p.origin]) waitTimesByOrigin[p.origin] = [];
      waitTimesByOrigin[p.origin].push(p.boardTime - p.arrivalTime);
    }
    
    if (p.exitTime !== null && p.boardTime !== null) {
      if (!serviceTimesByOrigin[p.origin]) serviceTimesByOrigin[p.origin] = [];
      serviceTimesByOrigin[p.origin].push(p.exitTime - p.boardTime);
    }
  }
  
  const totalIdleTime = stateTimeTracking['IDLE'];
  const utilizationRate = ((time - totalIdleTime) / time) * 100.0;
  const busyProbability = arrivalCount > 0 ? ((arrivalCount - arrivalsWhenIdle) / arrivalCount) * 100.0 : 0.0;
  
  return {
    simHours: time / 3600,
    served: served.length,
    utilizationRate,
    busyProbability,
    waitTimesByOrigin,
    serviceTimesByOrigin,
    queueHist,
    hourlyMaxDistributions: hourlyMaxQueueLength,
    numFloors,
    lobbyFloor,
    processedByFloor: Array.from(processedByFloor),
    exitWithWaitingByFloor: Array.from(exitWithWaitingByFloor),
    actualArrivalRate: arrivalCount / (time / 3600),
    stateTimeTracking,
  };
}