// Parallel Simulation Worker Lambda
// Processes a subset of seeds and returns partial results

class QueueSimulation {
  constructor(seed = null) {
    this.seed = seed;
    this.rng = this.createRNG(seed || Math.floor(Math.random() * 1000000));
    this.events = [];
    this.queueLengths = [0, 0];
    this.roadOccupied = false;
    this.roadDirection = null;

    this.nextDepartureTime = null;
    this.nextDepartureDirection = null;
    this.carsOnRoadCount = 0;

    this.lastEntryTime = [null, null];
    this.queueTime = [{}, {}];
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
    this.queueCounts = [0, 0];

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
    if (!isFinite(rate) || rate <= 0) {
      console.warn('Invalid rate in exponentialRandom:', rate);
      return 1;
    }

    const u = this.rng();
    const safeU = Math.max(u, 1e-10);
    return -Math.log(safeU) / rate;
  }

  adjustedInterarrival(targetRate, minGap) {
    if (minGap === 0) {
      return this.exponentialRandom(targetRate);
    }

    const targetMean = 1 / targetRate;

    if (minGap >= targetMean) {
      console.warn('minGap exceeds target mean interarrival time');
      return minGap;
    }

    const adjustedMean = targetMean - minGap;

    if (adjustedMean <= 0) {
      console.warn('Adjusted mean is non-positive:', adjustedMean);
      return minGap + 1;
    }

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

    this.carsOnRoadCount++;
    if (this.nextDepartureTime === null || departureTime < this.nextDepartureTime) {
      this.nextDepartureTime = departureTime;
      this.nextDepartureDirection = direction;
    }

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
    if (this.nextDepartureTime !== null && currentTime >= this.nextDepartureTime) {
      this.carsOnRoadCount--;

      if (this.carsOnRoadCount === 0) {
        this.nextDepartureTime = null;
        this.nextDepartureDirection = null;
      } else {
        this.nextDepartureTime = null;
        for (const event of this.events) {
          if (event[1] === 'departure' && event[0] > currentTime) {
            if (this.nextDepartureTime === null || event[0] < this.nextDepartureTime) {
              this.nextDepartureTime = event[0];
              this.nextDepartureDirection = event[2];
            }
          }
        }
      }
    }

    if (this.carsOnRoadCount === 0) {
      if (this.roadOccupied) {
        const lastPeriod = this.roadOccupancyPeriods[this.roadOccupancyPeriods.length - 1];
        if (lastPeriod && lastPeriod.end === null) {
          lastPeriod.end = currentTime;
        }
        this.closeDirectionalOccupancy(currentTime);
      }
      this.roadOccupied = false;
      this.roadDirection = null;
    } else if (this.nextDepartureDirection !== null && this.roadDirection !== this.nextDepartureDirection) {
      this.closeDirectionalOccupancy(currentTime);
      this.roadDirection = this.nextDepartureDirection;
      this.directionalOccupancy[this.nextDepartureDirection].push({start: currentTime, end: null});
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
          this.fcfsQueue.splice(i, 1);
          return customer;
        }
      }
      return null;
    } else if (priorityScheme === 'A') {
      if (this.queueLengths[0] > 0 && this.canEnterRoad(0, currentTime, minFollowUp)) {
        const customer = this.fcfsQueue.find(c => c.direction === 0);
        if (customer) {
          const index = this.fcfsQueue.indexOf(customer);
          this.fcfsQueue.splice(index, 1);
          return customer;
        }
      }
      if (this.queueLengths[1] > 0 && this.canEnterRoad(1, currentTime, minFollowUp)) {
        const customer = this.fcfsQueue.find(c => c.direction === 1);
        if (customer) {
          const index = this.fcfsQueue.indexOf(customer);
          this.fcfsQueue.splice(index, 1);
          return customer;
        }
      }
    } else if (priorityScheme === 'B') {
      if (this.queueLengths[1] > 0 && this.canEnterRoad(1, currentTime, minFollowUp)) {
        const customer = this.fcfsQueue.find(c => c.direction === 1);
        if (customer) {
          const index = this.fcfsQueue.indexOf(customer);
          this.fcfsQueue.splice(index, 1);
          return customer;
        }
      }
      if (this.queueLengths[0] > 0 && this.canEnterRoad(0, currentTime, minFollowUp)) {
        const customer = this.fcfsQueue.find(c => c.direction === 0);
        if (customer) {
          const index = this.fcfsQueue.indexOf(customer);
          this.fcfsQueue.splice(index, 1);
          return customer;
        }
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

    const utilization = (totalOccupiedTime / simulationTime) * 100;
    return isFinite(utilization) ? utilization : 0;
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
      isFinite(directionalTimes[0]) ? (directionalTimes[0] / simulationTime) * 100 : 0,
      isFinite(directionalTimes[1]) ? (directionalTimes[1] / simulationTime) * 100 : 0
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

          this.fcfsQueue.push({
            arrivalTime: eventTime,
            direction: qIndex
          });

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

  safeValue(value, defaultValue = 0) {
    return (isFinite(value) && !isNaN(value)) ? value : defaultValue;
  }

  calculateResults(simulationTime) {
    const results = {
      queues: [],
      serverUtilization: this.safeValue(this.calculateRoadUtilization(simulationTime)),
      directionalUtilization: this.calculateDirectionalUtilization(simulationTime).map(v => this.safeValue(v)),
      arrivalRates: [],
      delays: [],
      totalArrivals: this.totalArrivals.slice()
    };

    for (let i = 0; i < 2; i++) {
      const queueName = i === 0 ? 'Queue A' : 'Queue B';
      const totalTime = Object.values(this.queueTime[i]).reduce((sum, time) => sum + time, 0);

      const lengthPercentages = {};
      for (const [length, time] of Object.entries(this.queueTime[i])) {
        const percentage = totalTime > 0 ? (time / totalTime) * 100 : 0;
        lengthPercentages[length] = this.safeValue(percentage);
      }

      const maxCounts = {};
      for (const hourMax of this.hourlyMaxLength[i]) {
        maxCounts[hourMax] = (maxCounts[hourMax] || 0) + 1;
      }

      const maxPercentages = {};
      for (const [length, count] of Object.entries(maxCounts)) {
        const percentage = this.numHours > 0 ? (count / this.numHours) * 100 : 0;
        maxPercentages[length] = this.safeValue(percentage);
      }

      results.queues.push({
        name: queueName,
        lengthPercentages,
        maxPercentages
      });

      const hoursSimulated = simulationTime / 3600;
      const rateSamePerHour = hoursSimulated > 0 ? this.arrivalsSame[i] / hoursSimulated : 0;
      const rateOppositePerHour = hoursSimulated > 0 ? this.arrivalsOpposite[i] / hoursSimulated : 0;
      const rateNonePerHour = hoursSimulated > 0 ? this.arrivalsNone[i] / hoursSimulated : 0;
      const totalPerHour = hoursSimulated > 0 ? this.totalArrivals[i] / hoursSimulated : 0;

      results.arrivalRates.push({
        name: queueName,
        sameQueue: this.safeValue(rateSamePerHour),
        oppositeQueue: this.safeValue(rateOppositePerHour),
        noqueue: this.safeValue(rateNonePerHour),
        totalPerHour: this.safeValue(totalPerHour)
      });

      const avgDelayAllVehicles = this.vehicleCount[i] > 0 ?
        this.totalDelayTime[i] / this.vehicleCount[i] : 0;
      const avgDelayQueuedVehicles = this.queuedVehicleCount[i] > 0 ?
        this.queuedDelayTime[i] / this.queuedVehicleCount[i] : 0;

      results.delays.push({
        name: queueName,
        avgDelayAll: this.safeValue(avgDelayAllVehicles),
        avgDelayQueued: this.safeValue(avgDelayQueuedVehicles),
        totalVehicles: this.vehicleCount[i],
        queuedVehicles: this.queuedVehicleCount[i]
      });
    }

    return results;
  }
}

// Worker function - processes assigned seeds
function runWorkerSimulations(params) {
  const { startSeed, endSeed, seedMode, ...simParams } = params;
  const seedsToProcess = endSeed - startSeed + 1;

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

  for (let i = startSeed; i <= endSeed; i++) {
    let seed;
    if (seedMode === 'fixed') {
      seed = i;
    } else {
      seed = Math.floor(Math.random() * 1000000);
    }

    const simulation = new QueueSimulation(seed);
    const result = simulation.simulate(simParams);

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

  // Average the results for this worker's seeds
  const avgServerUtil = seedsToProcess > 0 ? totalServerUtil / seedsToProcess : 0;
  const avgDirectionalUtil = [
    seedsToProcess > 0 ? totalDirectionalUtil[0] / seedsToProcess : 0,
    seedsToProcess > 0 ? totalDirectionalUtil[1] / seedsToProcess : 0
  ];

  const avgQueueTime = [{}, {}];
  const avgMaxCounts = [{}, {}];

  for (let i = 0; i < 2; i++) {
    for (const [length, total] of Object.entries(aggregateQueueTime[i])) {
      avgQueueTime[i][length] = seedsToProcess > 0 ? total / seedsToProcess : 0;
    }
    for (const [length, total] of Object.entries(aggregateMaxCounts[i])) {
      avgMaxCounts[i][length] = seedsToProcess > 0 ? total / seedsToProcess : 0;
    }
  }

  const avgArrivalRates = [
    {
      same: seedsToProcess > 0 ? aggregateArrivalRates[0].same / seedsToProcess : 0,
      opposite: seedsToProcess > 0 ? aggregateArrivalRates[0].opposite / seedsToProcess : 0,
      noqueue: seedsToProcess > 0 ? aggregateArrivalRates[0].noqueue / seedsToProcess : 0,
      total: seedsToProcess > 0 ? aggregateArrivalRates[0].total / seedsToProcess : 0
    },
    {
      same: seedsToProcess > 0 ? aggregateArrivalRates[1].same / seedsToProcess : 0,
      opposite: seedsToProcess > 0 ? aggregateArrivalRates[1].opposite / seedsToProcess : 0,
      noqueue: seedsToProcess > 0 ? aggregateArrivalRates[1].noqueue / seedsToProcess : 0,
      total: seedsToProcess > 0 ? aggregateArrivalRates[1].total / seedsToProcess : 0
    }
  ];

  const avgDelays = [
    {
      delayAll: seedsToProcess > 0 ? aggregateDelays[0].delayAll / seedsToProcess : 0,
      delayQueued: seedsToProcess > 0 ? aggregateDelays[0].delayQueued / seedsToProcess : 0,
      totalVehicles: seedsToProcess > 0 ? aggregateDelays[0].totalVehicles / seedsToProcess : 0,
      queuedVehicles: seedsToProcess > 0 ? aggregateDelays[0].queuedVehicles / seedsToProcess : 0
    },
    {
      delayAll: seedsToProcess > 0 ? aggregateDelays[1].delayAll / seedsToProcess : 0,
      delayQueued: seedsToProcess > 0 ? aggregateDelays[1].delayQueued / seedsToProcess : 0,
      totalVehicles: seedsToProcess > 0 ? aggregateDelays[1].totalVehicles / seedsToProcess : 0,
      queuedVehicles: seedsToProcess > 0 ? aggregateDelays[1].queuedVehicles / seedsToProcess : 0
    }
  ];

  return {
    serverUtilization: avgServerUtil,
    directionalUtilization: avgDirectionalUtil,
    queueTime: avgQueueTime,
    maxCounts: avgMaxCounts,
    arrivalRates: avgArrivalRates,
    delays: avgDelays,
    seedsProcessed: seedsToProcess
  };
}

// Lambda handler
export const main = async (event) => {
  try {
    console.log('Worker started:', {
      startSeed: event.startSeed,
      endSeed: event.endSeed,
      seedsToProcess: event.endSeed - event.startSeed + 1
    });

    const startTime = Date.now();
    const results = runWorkerSimulations(event);
    const duration = Date.now() - startTime;

    console.log('Worker completed:', {
      duration: `${duration}ms`,
      seedsProcessed: results.seedsProcessed
    });

    return {
      statusCode: 200,
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error('Worker error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Worker failed: ' + error.message
      })
    };
  }
};

// Export for local testing
export { runWorkerSimulations };
