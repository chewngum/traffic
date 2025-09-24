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
      const results = await runMultipleSimulations(parameters);
      res.json({ success: true, results });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Simulation failed: ' + error.message });
  }
}

// PROTECTED: All simulation logic hidden on server
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

class Event { 
  constructor(time, type, data = {}) { 
    this.time = time; 
    this.type = type; 
    this.data = data; 
  } 
}

class EventQueue {
  constructor() { 
    this.events = []; 
  }
  
  add(event) { 
    let i = 0; 
    while (i < this.events.length && this.events[i].time <= event.time) i++; 
    this.events.splice(i, 0, event); 
  }
  
  next() { 
    return this.events.shift(); 
  }
  
  isEmpty() { 
    return this.events.length === 0; 
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
    this.totalQueueTime = 0; 
    this.queueTimeForQueued = 0;
    this.occupancyHistory = []; 
    this.lastRecordTime = 0; 
    this.random = new SeededRandom(this.params.seed); 
    this.nextArrivalTime = 0;
    this.queuedCarTimes = []; // Track arrival times of queued cars
    this.scheduleNextArrival();
  }
  
  // Generate service time based on distribution type
  generateServiceTime() {
    const meanServiceTime = this.params.serviceTime; // Already in hours
    
    if (this.params.serviceTimeDistribution === 'exponential') {
      // For exponential distribution, rate = 1/mean
      // Generate exponential random variable with the specified mean
      return this.random.exponential(1 / meanServiceTime);
    } else {
      // Constant service time
      return meanServiceTime;
    }
  }
  
  scheduleNextArrival() {
    const interArrival = this.random.exponential(this.params.arrivalRate);
    const adjustedTime = Math.max(interArrival, this.params.minHeadway);
    this.nextArrivalTime += adjustedTime;
    if (this.nextArrivalTime < this.params.simulationHours) {
      this.eventQueue.add(new Event(this.nextArrivalTime, 'arrival'));
    }
  }
  
  recordOccupancy() {
    const timeDiff = this.currentTime - this.lastRecordTime;
    if (timeDiff > 0) {
      this.occupancyHistory.push({ 
        time: timeDiff, 
        parked: this.parkedCars, 
        queued: this.queuedCars, 
        total: this.parkedCars + this.queuedCars 
      });
    }
    this.lastRecordTime = this.currentTime;
  }
  
  handleArrival() {
    this.totalArrivals++; 
    this.scheduleNextArrival();
    
    if (this.modelType === 'infinite') {
      this.parkedCars++; 
      const serviceTime = this.generateServiceTime();
      this.eventQueue.add(new Event(this.currentTime + serviceTime, 'departure'));
    } else if (this.modelType === 'blocking') {
      if (this.parkedCars < this.params.spaces) { 
        this.parkedCars++; 
        const serviceTime = this.generateServiceTime();
        this.eventQueue.add(new Event(this.currentTime + serviceTime, 'departure')); 
      } else {
        this.totalBlocked++;
      }
    } else if (this.modelType === 'queuing') {
      if (this.parkedCars < this.params.spaces) { 
        this.parkedCars++; 
        const serviceTime = this.generateServiceTime();
        this.eventQueue.add(new Event(this.currentTime + serviceTime, 'departure')); 
      } else if (this.queuedCars < this.params.queueLength) { 
        this.queuedCars++; 
        this.totalQueued++; 
        // Store arrival time for queue time calculation
        if (!this.queuedCarTimes) this.queuedCarTimes = [];
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
      
      // Calculate actual queue time: current time - arrival time of first queued car
      const arrivalTime = this.queuedCarTimes.shift(); // Remove first car from queue (FIFO)
      const actualQueueTime = this.currentTime - arrivalTime;
      
      this.totalQueueTime += actualQueueTime; 
      this.queueTimeForQueued += actualQueueTime;
      
      // Now generate service time for the newly parked car
      const serviceTime = this.generateServiceTime();
      this.eventQueue.add(new Event(this.currentTime + serviceTime, 'departure'));
    }
  }
  
  run() {
    while (!this.eventQueue.isEmpty() && this.currentTime < this.params.simulationHours) {
      const event = this.eventQueue.next(); 
      this.recordOccupancy(); 
      this.currentTime = event.time;
      
      if (event.type === 'arrival') {
        this.handleArrival(); 
      } else if (event.type === 'departure') {
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
    if (this.occupancyHistory.length === 0) return {};
    
    const totalTime = this.occupancyHistory.reduce((sum, h) => sum + h.time, 0);
    const levels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
    const parkedFreq = new Map();
    const queuedFreq = new Map();
    const totalFreq = new Map();
    
    for (const history of this.occupancyHistory) {
      const time = history.time;
      parkedFreq.set(history.parked, (parkedFreq.get(history.parked) || 0) + time);
      queuedFreq.set(history.queued, (queuedFreq.get(history.queued) || 0) + time);
      totalFreq.set(history.total, (totalFreq.get(history.total) || 0) + time);
    }
    
    const results = { parked: {}, queued: {}, total: {} };
    for (const level of levels) {
      const targetTime = (level / 100) * totalTime;
      results.parked[level] = this.findPercentileValue(parkedFreq, targetTime);
      results.queued[level] = this.findPercentileValue(queuedFreq, targetTime);
      results.total[level] = this.findPercentileValue(totalFreq, targetTime);
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

function aggregateResults(results) {
  const n = results.length; 
  if (n === 0) return null;
  
  const aggregated = { 
    percentiles: { parked: {}, queued: {}, total: {} }, 
    expectedArrivalRate: results[0].expectedArrivalRate, 
    actualArrivalRate: 0, 
    queuedPercentage: 0, 
    blockedPercentage: 0, 
    avgQueueTimePerArrival: 0, 
    avgQueueTimePerQueued: 0 
  };
  
  for (const result of results) {
    aggregated.actualArrivalRate += result.actualArrivalRate / n; 
    aggregated.queuedPercentage += result.queuedPercentage / n;
    aggregated.blockedPercentage += result.blockedPercentage / n; 
    aggregated.avgQueueTimePerArrival += result.avgQueueTimePerArrival / n;
    aggregated.avgQueueTimePerQueued += result.avgQueueTimePerQueued / n;
  }
  
  const levels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99];
  for (const level of levels) {
    aggregated.percentiles.parked[level] = 0; 
    aggregated.percentiles.queued[level] = 0; 
    aggregated.percentiles.total[level] = 0;
    for (const result of results) {
      aggregated.percentiles.parked[level] += result.percentiles.parked[level] / n;
      aggregated.percentiles.queued[level] += result.percentiles.queued[level] / n;
      aggregated.percentiles.total[level] += result.percentiles.total[level] / n;
    }
  }
  
  return aggregated;
}

async function runMultipleSimulations(params) {
  // Validate service time distribution parameter
  if (!params.serviceTimeDistribution) {
    params.serviceTimeDistribution = 'constant'; // Default to constant
  }
  
  if (!['constant', 'exponential'].includes(params.serviceTimeDistribution)) {
    throw new Error('Invalid service time distribution. Must be "constant" or "exponential".');
  }
  
  const models = ['infinite', 'blocking', 'queuing']; 
  const allResults = {};
  
  for (const model of models) {
    const modelResults = [];
    for (let seed = 0; seed < params.numSeeds; seed++) {
      const seedValue = params.seedMode === 'fixed' ? seed + 1 : Math.random() * 1000000;
      const simParams = { ...params, seed: seedValue }; 
      const simulation = new CarParkSimulation(simParams, model);
      const result = simulation.run(); 
      modelResults.push(result);
    }
    allResults[model] = aggregateResults(modelResults);
  }
  
  return {
    ...allResults,
    numSeeds: params.numSeeds,
    serviceTimeDistribution: params.serviceTimeDistribution
  };
}