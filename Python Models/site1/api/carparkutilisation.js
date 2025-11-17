export default async function handler(req, res) {
  // Authentication is handled by the Lambda wrapper (simulation-wrapper.js)

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, parameters } = req.body;

  try {
    if (action === 'runSimulation') {
      const startTime = Date.now();
      const results = await runMultipleSimulations(parameters);
      const executionTimeMs = Date.now() - startTime;

      console.log(`Carpark Utilisation simulation completed in ${executionTimeMs}ms`);
      res.json({ success: true, results, executionTimeMs });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Simulation failed: ' + error.message });
  }
}

class SeededRandom {
  constructor(seed = Date.now()) { 
    this.seed = seed; 
    this.current = seed; 
  }
  
  next() { 
    this.current = (this.current * 9301 + 49297) % 233280; 
    return this.current / 233280; 
  }
  
  exponential(rate) { 
    return -Math.log(1 - this.next()) / rate; 
  }
}

// Optimized: Heap-based priority queue instead of linear insertion
class EventQueue {
  constructor() { 
    this.heap = []; 
  }
  
  add(time, type, data = null) { 
    // Optimized: Use array [time, type, data] instead of Event object
    this.heap.push([time, type, data]);
    this.bubbleUp(this.heap.length - 1);
  }
  
  next() { 
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop();
    
    const result = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.bubbleDown(0);
    return result;
  }
  
  isEmpty() { 
    return this.heap.length === 0; 
  }
  
  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex][0] <= this.heap[index][0]) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }
  
  bubbleDown(index) {
    while (true) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      
      if (leftChild < this.heap.length && this.heap[leftChild][0] < this.heap[minIndex][0]) {
        minIndex = leftChild;
      }
      if (rightChild < this.heap.length && this.heap[rightChild][0] < this.heap[minIndex][0]) {
        minIndex = rightChild;
      }
      if (minIndex === index) break;
      [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
      index = minIndex;
    }
  }
}

class CarParkSimulation {
  constructor(params, modelType) { 
    this.params = params; 
    this.modelType = modelType; 
    this.reset(); 
  }
  
  reset() {
    this.eventQueue = new EventQueue(); 
    this.currentTime = 0; 
    this.parkedCars = 0; 
    this.queuedCars = 0;
    this.totalArrivals = 0; 
    this.totalQueued = 0; 
    this.totalBlocked = 0; 
    
    // Optimized: Use running sums instead of storing all times
    this.totalQueueTime = 0; 
    this.queueTimeForQueued = 0;
    
    // Optimized: Track time-weighted occupancy instead of storing every state
    this.occupancyTimeWeighted = new Map(); // Map<occupancy_level, time_spent>
    this.queuedTimeWeighted = new Map();
    this.totalTimeWeighted = new Map();
    this.lastRecordTime = 0; 
    
    this.arrivalRandom = new SeededRandom(this.params.seed); 
    this.serviceRandom = new SeededRandom(this.params.seed + 999999);
    
    this.nextArrivalTime = 0;
    
    // Optimized: Use queue for FIFO, not array storage of all times
    this.queueHead = 0; // Index of first queued car
    this.queuedCarTimes = []; // Only store times currently in queue
    
    this.scheduleNextArrival();
  }
  
  generateServiceTime() {
    const meanServiceTime = this.params.serviceTime;
    
    if (this.params.serviceTimeDistribution === 'exponential') {
      return this.serviceRandom.exponential(1 / meanServiceTime);
    } else {
      return meanServiceTime;
    }
  }
  
  scheduleNextArrival() {
    const interArrival = this.arrivalRandom.exponential(this.params.arrivalRate);
    const adjustedTime = Math.max(interArrival, this.params.minHeadway);
    this.nextArrivalTime += adjustedTime;
    if (this.nextArrivalTime < this.params.simulationHours) {
      this.eventQueue.add(this.nextArrivalTime, 'arrival');
    }
  }
  
  recordOccupancy() {
    const timeDiff = this.currentTime - this.lastRecordTime;
    if (timeDiff > 0) {
      // Optimized: Accumulate time-weighted counts instead of storing array
      const parked = this.parkedCars;
      const queued = this.queuedCars;
      const total = parked + queued;
      
      this.occupancyTimeWeighted.set(parked, (this.occupancyTimeWeighted.get(parked) || 0) + timeDiff);
      this.queuedTimeWeighted.set(queued, (this.queuedTimeWeighted.get(queued) || 0) + timeDiff);
      this.totalTimeWeighted.set(total, (this.totalTimeWeighted.get(total) || 0) + timeDiff);
    }
    this.lastRecordTime = this.currentTime;
  }
  
  handleArrival() {
    this.totalArrivals++; 
    this.scheduleNextArrival();
    
    if (this.modelType === 'infinite') {
      this.parkedCars++; 
      const serviceTime = this.generateServiceTime();
      this.eventQueue.add(this.currentTime + serviceTime, 'departure');
    } else if (this.modelType === 'blocking') {
      if (this.parkedCars < this.params.spaces) { 
        this.parkedCars++; 
        const serviceTime = this.generateServiceTime();
        this.eventQueue.add(this.currentTime + serviceTime, 'departure'); 
      } else {
        this.totalBlocked++;
      }
    } else if (this.modelType === 'queuing') {
      if (this.parkedCars < this.params.spaces) { 
        this.parkedCars++; 
        const serviceTime = this.generateServiceTime();
        this.eventQueue.add(this.currentTime + serviceTime, 'departure'); 
      } else if (this.queuedCars < this.params.queueLength) { 
        this.queuedCars++; 
        this.totalQueued++; 
        this.queuedCarTimes.push(this.currentTime);
      } else {
        this.totalBlocked++;
      }
    }
  }
  
  handleDeparture() {
    this.parkedCars--;
    if (this.modelType === 'queuing' && this.queuedCars > 0) {
      this.queuedCars--; 
      this.parkedCars++; 
      
      // Optimized: Use queue head pointer instead of shift()
      const arrivalTime = this.queuedCarTimes[this.queueHead];
      this.queueHead++;
      
      // Periodically clean up the queue array to prevent unbounded growth
      if (this.queueHead > 1000) {
        this.queuedCarTimes = this.queuedCarTimes.slice(this.queueHead);
        this.queueHead = 0;
      }
      
      const actualQueueTime = this.currentTime - arrivalTime;
      
      this.totalQueueTime += actualQueueTime; 
      this.queueTimeForQueued += actualQueueTime;
      
      const serviceTime = this.generateServiceTime();
      this.eventQueue.add(this.currentTime + serviceTime, 'departure');
    }
  }
  
  run() {
    while (!this.eventQueue.isEmpty() && this.currentTime < this.params.simulationHours) {
      const event = this.eventQueue.next(); 
      this.recordOccupancy(); 
      this.currentTime = event[0]; // time
      
      if (event[1] === 'arrival') {
        this.handleArrival(); 
      } else if (event[1] === 'departure') {
        this.handleDeparture();
      }
    }
    this.recordOccupancy(); 
    return this.getResults();
  }
  
  getResults() {
    const totalTime = this.params.simulationHours; 
    const actualArrivalRate = this.totalArrivals / totalTime;
    const percentiles = this.calculatePercentiles(); 
    const queuedPercentage = this.totalQueued > 0 ? (this.totalQueued / this.totalArrivals) * 100 : 0;
    const blockedPercentage = this.totalBlocked > 0 ? (this.totalBlocked / this.totalArrivals) * 100 : 0;
    const avgQueueTimePerArrival = this.totalArrivals > 0 ? this.totalQueueTime / this.totalArrivals : 0;
    const avgQueueTimePerQueued = this.totalQueued > 0 ? this.queueTimeForQueued / this.totalQueued : 0;
    
    return { 
      percentiles, 
      expectedArrivalRate: this.params.arrivalRate, 
      actualArrivalRate, 
      queuedPercentage, 
      blockedPercentage, 
      avgQueueTimePerArrival, 
      avgQueueTimePerQueued, 
      totalArrivals: this.totalArrivals, 
      totalQueued: this.totalQueued, 
      totalBlocked: this.totalBlocked 
    };
  }
  
  calculatePercentiles() {
    // Optimized: Already have time-weighted data, no need to process history array
    const totalTime = this.params.simulationHours;
    const levels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
    
    const results = { parked: {}, queued: {}, total: {} };
    for (const level of levels) {
      const targetTime = (level / 100) * totalTime;
      results.parked[level] = this.findPercentileValue(this.occupancyTimeWeighted, targetTime);
      results.queued[level] = this.findPercentileValue(this.queuedTimeWeighted, targetTime);
      results.total[level] = this.findPercentileValue(this.totalTimeWeighted, targetTime);
    }
    return results;
  }
  
  findPercentileValue(frequencyMap, targetTime) {
    const sortedLevels = Array.from(frequencyMap.keys()).sort((a, b) => a - b);
    let cumulativeTime = 0;
    for (const level of sortedLevels) { 
      cumulativeTime += frequencyMap.get(level); 
      if (cumulativeTime >= targetTime) return level; 
    }
    return sortedLevels[sortedLevels.length - 1] || 0;
  }
}

// Optimized: Streaming aggregation class
class StreamingAggregator {
  constructor() {
    this.count = 0;
    this.actualArrivalRate = 0;
    this.queuedPercentage = 0;
    this.blockedPercentage = 0;
    this.avgQueueTimePerArrival = 0;
    this.avgQueueTimePerQueued = 0;
    this.percentiles = { parked: {}, queued: {}, total: {} };
    this.expectedArrivalRate = null;
    
    const levels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
    for (const level of levels) {
      this.percentiles.parked[level] = 0;
      this.percentiles.queued[level] = 0;
      this.percentiles.total[level] = 0;
    }
  }
  
  addResult(result) {
    this.count++;
    const n = this.count;
    
    if (this.expectedArrivalRate === null) {
      this.expectedArrivalRate = result.expectedArrivalRate;
    }
    
    // Update running averages using Welford's online algorithm
    this.actualArrivalRate += (result.actualArrivalRate - this.actualArrivalRate) / n;
    this.queuedPercentage += (result.queuedPercentage - this.queuedPercentage) / n;
    this.blockedPercentage += (result.blockedPercentage - this.blockedPercentage) / n;
    this.avgQueueTimePerArrival += (result.avgQueueTimePerArrival - this.avgQueueTimePerArrival) / n;
    this.avgQueueTimePerQueued += (result.avgQueueTimePerQueued - this.avgQueueTimePerQueued) / n;
    
    const levels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
    for (const level of levels) {
      this.percentiles.parked[level] += (result.percentiles.parked[level] - this.percentiles.parked[level]) / n;
      this.percentiles.queued[level] += (result.percentiles.queued[level] - this.percentiles.queued[level]) / n;
      this.percentiles.total[level] += (result.percentiles.total[level] - this.percentiles.total[level]) / n;
    }
  }
  
  getResult() {
    return {
      percentiles: this.percentiles,
      expectedArrivalRate: this.expectedArrivalRate,
      actualArrivalRate: this.actualArrivalRate,
      queuedPercentage: this.queuedPercentage,
      blockedPercentage: this.blockedPercentage,
      avgQueueTimePerArrival: this.avgQueueTimePerArrival,
      avgQueueTimePerQueued: this.avgQueueTimePerQueued
    };
  }
}

async function runMultipleSimulations(params) {
  if (!params.serviceTimeDistribution) {
    params.serviceTimeDistribution = 'constant';
  }
  
  if (!['constant', 'exponential'].includes(params.serviceTimeDistribution)) {
    throw new Error('Invalid service time distribution. Must be "constant" or "exponential".');
  }
  
  const models = ['infinite', 'blocking', 'queuing']; 
  const allResults = {};
  
  // Optimized: Use streaming aggregation instead of storing all results
  for (const model of models) {
    const aggregator = new StreamingAggregator();
    
    for (let seed = 0; seed < params.numSeeds; seed++) {
      const seedValue = params.seedMode === 'fixed' ? seed + 1 : Math.random() * 1000000;
      const simParams = { ...params, seed: seedValue }; 
      const simulation = new CarParkSimulation(simParams, model);
      const result = simulation.run();
      
      // Optimized: Add to running average instead of storing
      aggregator.addResult(result);
    }
    
    allResults[model] = aggregator.getResult();
  }
  
  return {
    ...allResults,
    numSeeds: params.numSeeds,
    serviceTimeDistribution: params.serviceTimeDistribution
  };
}