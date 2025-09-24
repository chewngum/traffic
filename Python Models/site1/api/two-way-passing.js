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
  class QueueSimulation {
    constructor(seed = null) {
      this.seed = seed;
      this.rng = this.createRNG(seed || Math.floor(Math.random() * 1000000));
      this.events = [];
      this.queueLengths = [0, 0];
      this.roadOccupied = false;
      this.roadDirection = null;
      this.carsOnRoad = [];
      this.lastEntryTime = [null, null];
      this.queueTime = [{}, {}];
      this.serverBusyTime = 0;
      this.lastEventTime = 0;
      this.hourlyMaxLength = [];
      
      this.totalArrivals = [0, 0];
      this.arrivalsQueued = [0, 0];
      this.arrivalsImmediate = [0, 0];
      
      this.arrivalsNone = [0, 0];
      this.arrivalsSame = [0, 0];
      this.arrivalsOpposite = [0, 0];
      
      this.totalDelayTime = [0, 0];
      this.queuedDelayTime = [0, 0];
      this.vehicleCount = [0, 0];
      this.queuedVehicleCount = [0, 0];
      
      this.fcfsQueue = [];
      this.queuedVehicles = [[], []];
      this.nextCustomerId = 0;
      this.roadOccupancyPeriods = [];
      this.directionalOccupancy = [[], []];
    }
  
    createRNG(seed) {
      let state = seed;
      return function() {
        state = (state * 1664525 + 1013904223) % Math.pow(2, 32);
        return state / Math.pow(2, 32);
      }
    }
  
    heapPush(heap, item) {
      heap.push(item);
      this.heapifyUp(heap, heap.length - 1);
    }
  
    heapPop(heap) {
      if (heap.length === 0) return null;
      if (heap.length === 1) return heap.pop();
      
      const result = heap[0];
      heap[0] = heap.pop();
      this.heapifyDown(heap, 0);
      return result;
    }
  
    heapifyUp(heap, index) {
      while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        if (heap[parentIndex][0] <= heap[index][0]) break;
        [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
        index = parentIndex;
      }
    }
  
    heapifyDown(heap, index) {
      while (true) {
        let minIndex = index;
        const leftChild = 2 * index + 1;
        const rightChild = 2 * index + 2;
  
        if (leftChild < heap.length && heap[leftChild][0] < heap[minIndex][0]) {
          minIndex = leftChild;
        }
        if (rightChild < heap.length && heap[rightChild][0] < heap[minIndex][0]) {
          minIndex = rightChild;
        }
        if (minIndex === index) break;
        [heap[index], heap[minIndex]] = [heap[minIndex], heap[index]];
        index = minIndex;
      }
    }
  
    exponentialRandom(rate) {
      return -Math.log(this.rng()) / rate;
    }
  
    adjustedInterarrival(targetRate, minGap) {
      if (minGap === 0) {
        return this.exponentialRandom(targetRate);
      }
      
      const targetMean = 1 / targetRate;
      
      if (minGap >= targetMean) {
        return minGap;
      }
      
      const adjustedMean = targetMean - minGap;
      const adjustedRate = 1 / adjustedMean;
      
      return minGap + this.exponentialRandom(adjustedRate);
    }
  
    canEnterRoad(direction, currentTime, minFollowUp) {
      if (!this.roadOccupied) return true;
      
      if (this.roadDirection !== null && this.roadDirection !== direction) {
        return false;
      }
      
      if (minFollowUp > 0 && this.lastEntryTime[direction] !== null) {
        const timeSinceLastEntry = currentTime - this.lastEntryTime[direction];
        return timeSinceLastEntry >= minFollowUp;
      }
      
      return true;
    }
  
    canSkipQueue(direction, priorityScheme) {
      if (priorityScheme === 'FCFS') {
        return this.fcfsQueue.length === 0;
      }
      
      if (priorityScheme === 'A') {
        return this.queueLengths[0] === 0;
      } else if (priorityScheme === 'B') {
        return this.queueLengths[1] === 0;
      }
      
      return true;
    }
  
    enterRoad(direction, currentTime, serviceTime, arrivalTime = null) {
      if (!this.roadOccupied) {
        this.roadOccupied = true;
        this.roadDirection = direction;
        this.roadOccupancyPeriods.push({start: currentTime, end: null});
        this.directionalOccupancy[direction].push({start: currentTime, end: null});
      } else if (this.roadDirection !== direction) {
        this.closeDirectionalOccupancy(currentTime);
        this.roadDirection = direction;
        this.directionalOccupancy[direction].push({start: currentTime, end: null});
      }
      
      const departureTime = currentTime + serviceTime;
      this.carsOnRoad.push({direction, departureTime});
      this.lastEntryTime[direction] = currentTime;
      
      if (arrivalTime !== null) {
        const delay = currentTime - arrivalTime;
        this.totalDelayTime[direction] += delay;
        this.vehicleCount[direction]++;
        
        if (delay > 0) {
          this.queuedDelayTime[direction] += delay;
          this.queuedVehicleCount[direction]++;
        }
      }
      
      this.heapPush(this.events, [departureTime, 'departure', direction]);
    }
  
    updateRoadOccupancy(currentTime) {
      this.carsOnRoad = this.carsOnRoad.filter(car => car.departureTime > currentTime);
      
      if (this.carsOnRoad.length === 0) {
        if (this.roadOccupied) {
          const lastPeriod = this.roadOccupancyPeriods[this.roadOccupancyPeriods.length - 1];
          if (lastPeriod && lastPeriod.end === null) {
            lastPeriod.end = currentTime;
          }
          this.closeDirectionalOccupancy(currentTime);
        }
        this.roadOccupied = false;
        this.roadDirection = null;
      } else {
        const newDirection = this.carsOnRoad[0].direction;
        if (this.roadDirection !== newDirection) {
          this.closeDirectionalOccupancy(currentTime);
          this.roadDirection = newDirection;
          this.directionalOccupancy[newDirection].push({start: currentTime, end: null});
        }
      }
    }
  
    closeDirectionalOccupancy(currentTime) {
      if (this.roadDirection !== null) {
        const periods = this.directionalOccupancy[this.roadDirection];
        if (periods.length > 0) {
          const lastPeriod = periods[periods.length - 1];
          if (lastPeriod && lastPeriod.end === null) {
            lastPeriod.end = currentTime;
          }
        }
      }
    }
  
    selectNextQueue(priorityScheme, currentTime, minFollowUp) {
      if (priorityScheme === 'FCFS') {
        for (let i = 0; i < this.fcfsQueue.length; i++) {
          const customer = this.fcfsQueue[i];
          if (this.canEnterRoad(customer.direction, currentTime, minFollowUp)) {
            const removed = this.fcfsQueue.splice(i, 1)[0];
            return {direction: removed.direction, arrivalTime: removed.arrivalTime};
          }
        }
        return null;
      } else if (priorityScheme === 'A') {
        if (this.queueLengths[0] > 0 && this.canEnterRoad(0, currentTime, minFollowUp)) {
          const arrivalTime = this.queuedVehicles[0].shift();
          return {direction: 0, arrivalTime: arrivalTime};
        }
        if (this.queueLengths[1] > 0 && this.canEnterRoad(1, currentTime, minFollowUp)) {
          const arrivalTime = this.queuedVehicles[1].shift();
          return {direction: 1, arrivalTime: arrivalTime};
        }
      } else if (priorityScheme === 'B') {
        if (this.queueLengths[1] > 0 && this.canEnterRoad(1, currentTime, minFollowUp)) {
          const arrivalTime = this.queuedVehicles[1].shift();
          return {direction: 1, arrivalTime: arrivalTime};
        }
        if (this.queueLengths[0] > 0 && this.canEnterRoad(0, currentTime, minFollowUp)) {
          const arrivalTime = this.queuedVehicles[0].shift();
          return {direction: 0, arrivalTime: arrivalTime};
        }
      }
      return null;
    }
  
    recordTime(currentTime) {
      const dt = currentTime - this.lastEventTime;
      
      for (let i = 0; i < 2; i++) {
        const qLen = this.queueLengths[i];
        this.queueTime[i][qLen] = (this.queueTime[i][qLen] || 0) + dt;
        
        const hourIdx = Math.min(Math.floor(currentTime / 3600), this.numHours - 1);
        this.hourlyMaxLength[i][hourIdx] = Math.max(
          this.hourlyMaxLength[i][hourIdx] || 0, 
          qLen
        );
      }
      
      this.lastEventTime = currentTime;
    }
  
    calculateRoadUtilization(simulationTime) {
      let totalOccupiedTime = 0;
      
      for (const period of this.roadOccupancyPeriods) {
        const endTime = period.end !== null ? period.end : simulationTime;
        totalOccupiedTime += endTime - period.start;
      }
      
      return (totalOccupiedTime / simulationTime) * 100;
    }
  
    calculateDirectionalUtilization(simulationTime) {
      const directionalTimes = [0, 0];
      
      for (let direction = 0; direction < 2; direction++) {
        for (const period of this.directionalOccupancy[direction]) {
          const endTime = period.end !== null ? period.end : simulationTime;
          directionalTimes[direction] += endTime - period.start;
        }
      }
      
      return [
        (directionalTimes[0] / simulationTime) * 100,
        (directionalTimes[1] / simulationTime) * 100
      ];
    }
  
    simulate(params) {
      const {
        arrivalRateA,
        arrivalRateB, 
        serviceTime,
        simulationTime,
        minGap,
        minFollowUp,
        priorityScheme
      } = params;
  
      this.numHours = Math.floor(simulationTime / 3600);
      this.hourlyMaxLength = [
        new Array(this.numHours).fill(0),
        new Array(this.numHours).fill(0)
      ];
  
      const arrivalRate = [
        arrivalRateA / 3600,
        arrivalRateB / 3600
      ];
  
      for (let i = 0; i < 2; i++) {
        const firstArrival = this.adjustedInterarrival(arrivalRate[i], minGap);
        this.heapPush(this.events, [firstArrival, 'arrival', i]);
      }
  
      while (this.events.length > 0) {
        const event = this.heapPop(this.events);
        const [eventTime, eventType, qIndex] = event;
  
        if (eventTime > simulationTime) break;
  
        this.recordTime(eventTime);
        this.updateRoadOccupancy(eventTime);
  
        if (eventType === 'arrival') {
          this.totalArrivals[qIndex]++;
  
          if (this.canEnterRoad(qIndex, eventTime, minFollowUp) && 
              this.canSkipQueue(qIndex, priorityScheme)) {
            this.enterRoad(qIndex, eventTime, serviceTime, eventTime);
            this.arrivalsImmediate[qIndex]++;
          } else {
            this.queueLengths[qIndex]++;
            this.arrivalsQueued[qIndex]++;
            
            if (priorityScheme === 'FCFS') {
              this.fcfsQueue.push({
                arrivalTime: eventTime, 
                direction: qIndex,
                id: this.nextCustomerId++
              });
            } else {
              this.queuedVehicles[qIndex].push(eventTime);
            }
  
            if (this.roadOccupied) {
              if (this.roadDirection === qIndex) {
                this.arrivalsSame[qIndex]++;
              } else {
                this.arrivalsOpposite[qIndex]++;
              }
            } else {
              this.arrivalsNone[qIndex]++;
            }
          }
  
          const dt = this.adjustedInterarrival(arrivalRate[qIndex], minGap);
          const nextArrival = eventTime + dt;
          this.heapPush(this.events, [nextArrival, 'arrival', qIndex]);
  
        } else if (eventType === 'departure') {
          this.processQueueAfterDeparture(eventTime, serviceTime, minFollowUp, priorityScheme);
        }
      }
  
      if (this.roadOccupancyPeriods.length > 0) {
        const lastPeriod = this.roadOccupancyPeriods[this.roadOccupancyPeriods.length - 1];
        if (lastPeriod && lastPeriod.end === null) {
          lastPeriod.end = simulationTime;
        }
      }
      
      this.closeDirectionalOccupancy(simulationTime);
  
      return this.calculateResults(simulationTime);
    }
  
    processQueueAfterDeparture(currentTime, serviceTime, minFollowUp, priorityScheme) {
      const nextCustomer = this.selectNextQueue(priorityScheme, currentTime, minFollowUp);
      
      if (nextCustomer !== null) {
        this.queueLengths[nextCustomer.direction]--;
        this.enterRoad(nextCustomer.direction, currentTime, serviceTime, nextCustomer.arrivalTime);
      }
    }
  
    calculateResults(simulationTime) {
      const results = {
        queues: [],
        serverUtilization: this.calculateRoadUtilization(simulationTime),
        directionalUtilization: this.calculateDirectionalUtilization(simulationTime),
        arrivalRates: [],
        delays: [],
        totalArrivals: this.totalArrivals.slice()
      };
  
      for (let i = 0; i < 2; i++) {
        const queueName = i === 0 ? 'Queue A' : 'Queue B';
        const totalTime = Object.values(this.queueTime[i]).reduce((sum, time) => sum + time, 0);
        
        const lengthPercentages = {};
        for (const [length, time] of Object.entries(this.queueTime[i])) {
          lengthPercentages[length] = (time / totalTime) * 100;
        }
  
        const maxCounts = {};
        for (const hourMax of this.hourlyMaxLength[i]) {
          maxCounts[hourMax] = (maxCounts[hourMax] || 0) + 1;
        }
  
        const maxPercentages = {};
        for (const [length, count] of Object.entries(maxCounts)) {
          maxPercentages[length] = (count / this.numHours) * 100;
        }
  
        results.queues.push({
          name: queueName,
          lengthPercentages,
          maxPercentages
        });
  
        const rateSamePerHour = this.arrivalsSame[i] / (simulationTime / 3600);
        const rateOppositePerHour = this.arrivalsOpposite[i] / (simulationTime / 3600);
        const rateNonePerHour = this.arrivalsNone[i] / (simulationTime / 3600);
        
        results.arrivalRates.push({
          name: queueName,
          sameQueue: rateSamePerHour,
          oppositeQueue: rateOppositePerHour,
          noqueue: rateNonePerHour,
          totalPerHour: this.totalArrivals[i] / (simulationTime / 3600)
        });
  
        const avgDelayAllVehicles = this.vehicleCount[i] > 0 ? 
          this.totalDelayTime[i] / this.vehicleCount[i] : 0;
        const avgDelayQueuedVehicles = this.queuedVehicleCount[i] > 0 ? 
          this.queuedDelayTime[i] / this.queuedVehicleCount[i] : 0;
  
        results.delays.push({
          name: queueName,
          avgDelayAll: avgDelayAllVehicles,
          avgDelayQueued: avgDelayQueuedVehicles,
          totalVehicles: this.vehicleCount[i],
          queuedVehicles: this.queuedVehicleCount[i]
        });
      }
  
      return results;
    }
  }
  
  async function runMultipleSimulations(params) {
    const numSeeds = params.numSeeds || 100;
    const seedMode = params.seedMode || 'fixed';
    let totalServerUtil = 0;
    let totalDirectionalUtil = [0, 0];
  
    const aggregateQueueTime = [{}, {}];
    const aggregateMaxCounts = [{}, {}];
    const aggregateArrivalRates = [
      { same: 0, opposite: 0, noqueue: 0, total: 0 },
      { same: 0, opposite: 0, noqueue: 0, total: 0 }
    ];
    
    const aggregateDelays = [
      { delayAll: 0, delayQueued: 0, totalVehicles: 0, queuedVehicles: 0 },
      { delayAll: 0, delayQueued: 0, totalVehicles: 0, queuedVehicles: 0 }
    ];
  
    for (let i = 1; i <= numSeeds; i++) {
      let seed;
      if (seedMode === 'fixed') {
        seed = i;
      } else {
        seed = Math.floor(Math.random() * 1000000);
      }
  
      const simulation = new QueueSimulation(seed);
      const result = simulation.simulate({
        arrivalRateA: params.arrivalRateA,
        arrivalRateB: params.arrivalRateB,
        serviceTime: params.serviceTime,
        simulationTime: params.simulationTime,
        minGap: params.minGap,
        minFollowUp: params.minFollowUp,
        priorityScheme: params.priorityScheme
      });
  
      totalServerUtil += result.serverUtilization;
      totalDirectionalUtil[0] += result.directionalUtilization[0];
      totalDirectionalUtil[1] += result.directionalUtilization[1];
  
      for (let j = 0; j < 2; j++) {
        for (const [length, percent] of Object.entries(result.queues[j].lengthPercentages)) {
          aggregateQueueTime[j][length] = (aggregateQueueTime[j][length] || 0) + percent;
        }
  
        for (const [length, percent] of Object.entries(result.queues[j].maxPercentages)) {
          aggregateMaxCounts[j][length] = (aggregateMaxCounts[j][length] || 0) + percent;
        }
  
        aggregateArrivalRates[j].same += result.arrivalRates[j].sameQueue;
        aggregateArrivalRates[j].opposite += result.arrivalRates[j].oppositeQueue;
        aggregateArrivalRates[j].noqueue += result.arrivalRates[j].noqueue;
        aggregateArrivalRates[j].total += result.arrivalRates[j].totalPerHour;
        
        aggregateDelays[j].delayAll += result.delays[j].avgDelayAll;
        aggregateDelays[j].delayQueued += result.delays[j].avgDelayQueued;
        aggregateDelays[j].totalVehicles += result.delays[j].totalVehicles;
        aggregateDelays[j].queuedVehicles += result.delays[j].queuedVehicles;
      }
    }
  
    const avgResults = {
      queues: [],
      serverUtilization: totalServerUtil / numSeeds,
      directionalUtilization: [
        totalDirectionalUtil[0] / numSeeds,
        totalDirectionalUtil[1] / numSeeds
      ],
      arrivalRates: [],
      delays: [],
      numSeeds: numSeeds
    };
  
    for (let i = 0; i < 2; i++) {
      const queueName = i === 0 ? 'Queue A' : 'Queue B';
      
      const avgLengthPercentages = {};
      for (const [length, totalPercent] of Object.entries(aggregateQueueTime[i])) {
        avgLengthPercentages[length] = totalPercent / numSeeds;
      }
  
      const avgMaxPercentages = {};
      for (const [length, totalPercent] of Object.entries(aggregateMaxCounts[i])) {
        avgMaxPercentages[length] = totalPercent / numSeeds;
      }
  
      avgResults.queues.push({
        name: queueName,
        lengthPercentages: avgLengthPercentages,
        maxPercentages: avgMaxPercentages
      });
  
      avgResults.arrivalRates.push({
        name: queueName,
        sameQueue: aggregateArrivalRates[i].same / numSeeds,
        oppositeQueue: aggregateArrivalRates[i].opposite / numSeeds,
        noqueue: aggregateArrivalRates[i].noqueue / numSeeds,
        totalPerHour: aggregateArrivalRates[i].total / numSeeds
      });
  
      avgResults.delays.push({
        name: queueName,
        avgDelayAll: aggregateDelays[i].delayAll / numSeeds,
        avgDelayQueued: aggregateDelays[i].delayQueued / numSeeds,
        totalVehicles: aggregateDelays[i].totalVehicles / numSeeds,
        queuedVehicles: aggregateDelays[i].queuedVehicles / numSeeds
      });
    }
  
    return avgResults;
  }