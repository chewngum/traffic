/**
 * Main API handler for the two-way passing simulation endpoint
 * This function processes requests to run traffic simulations for a single-lane road
 * where vehicles from two directions must take turns using the road
 *
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 */
export default async function handler(req, res) {
    // ============================================================================
    // AUTHENTICATION: Handled by Lambda wrapper (simulation-wrapper.js)
    // ============================================================================

    // ============================================================================
    // HTTP METHOD VALIDATION: Only accept POST requests
    // ============================================================================
    // Simulations require data to be sent in the request body, so we only accept POST
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Extract the action type and simulation parameters from the request body
    const { action, parameters } = req.body;

    try {
      // ============================================================================
      // ACTION ROUTING: Handle different types of simulation requests
      // ============================================================================
      if (action === 'runSimulation') {
        // STEP 1: Validate that the input parameters are mathematically sound
        // This prevents impossible scenarios like arrival rates too high for the service rate
        const validation = validateParameters(parameters);
        if (!validation.valid) {
          // Return a 400 Bad Request with a descriptive error message
          return res.status(400).json({ error: validation.error });
        }

        // STEP 2: Record when simulation starts for performance monitoring
        const startTime = Date.now();

        // STEP 3: Run the simulation (potentially multiple times with different random seeds)
        // This is async to allow for long-running simulations without blocking
        const results = await runMultipleSimulations(parameters);

        // STEP 4: Calculate total execution time for performance tracking
        const executionTimeMs = Date.now() - startTime;

        // Log completion for server monitoring and debugging
        console.log(`Two-Way Passing simulation completed in ${executionTimeMs}ms`);

        // Return successful results with execution time
        res.json({ success: true, results, executionTimeMs });
      } else {
        // If an unknown action is requested, return error
        res.status(400).json({ error: 'Invalid action' });
      }
    } catch (error) {
      // Catch any unexpected errors during simulation and return a 500 Internal Server Error
      // Include the error message for debugging
      res.status(500).json({ error: 'Simulation failed: ' + error.message });
    }
  }
  
/**
 * Validates simulation parameters to ensure they create a mathematically feasible scenario
 * Prevents impossible situations that would cause infinite queues or invalid simulations
 *
 * @param {Object} params - Simulation parameters
 * @returns {Object} - { valid: boolean, error?: string }
 */
  function validateParameters(params) {
    // Extract parameters with default values for optional ones
    const {
      arrivalRateA,      // Vehicles per hour arriving from direction A
      arrivalRateB,      // Vehicles per hour arriving from direction B
      serviceTime,       // Time (seconds) for a vehicle to traverse the single-lane road
      minGap = 0,        // Minimum time gap between consecutive arrivals (seconds)
      minFollowUp = 0    // Minimum time between consecutive vehicles entering from same direction (seconds)
    } = params;

    // ============================================================================
    // STEP 1: Convert hourly arrival rates to per-second rates
    // ============================================================================
    // We need per-second rates for calculating mean interarrival times
    const rateA = arrivalRateA / 3600;  // vehicles per second from A
    const rateB = arrivalRateB / 3600;  // vehicles per second from B

    // Calculate mean time between consecutive arrivals for each direction
    // Mean interarrival time = 1 / arrival rate
    const meanInterarrivalA = 1 / rateA;  // seconds
    const meanInterarrivalB = 1 / rateB;  // seconds

    // ============================================================================
    // STEP 2: Validate minGap against mean interarrival times
    // ============================================================================
    // If minGap is specified, we need to ensure it's not too close to the mean interarrival time
    // WHY: If minGap is nearly as large as the mean time between arrivals, the adjusted
    // exponential distribution would have very little or negative variability, which is invalid
    if (minGap > 0) {
      // Check Queue A: minGap must be less than 95% of mean interarrival time
      // The 0.95 threshold leaves enough room for exponential variability
      if (minGap >= meanInterarrivalA * 0.95) {
        return {
          valid: false,
          error: `Queue A: minGap (${minGap}s) is too close to mean interarrival time (${meanInterarrivalA.toFixed(2)}s). Reduce arrival rate or minGap.`
        };
      }

      // Check Queue B: same validation
      if (minGap >= meanInterarrivalB * 0.95) {
        return {
          valid: false,
          error: `Queue B: minGap (${minGap}s) is too close to mean interarrival time (${meanInterarrivalB.toFixed(2)}s). Reduce arrival rate or minGap.`
        };
      }
    }

    // ============================================================================
    // STEP 3: Validate minFollowUp against service time and interarrival times
    // ============================================================================
    // If minFollowUp is specified, ensure it's reasonable
    // WHY: If minFollowUp is too large, it can prevent vehicles from following each other efficiently
    if (minFollowUp > 0) {
      // Check that minFollowUp doesn't exceed service time
      // WHY: If minFollowUp > serviceTime, vehicles can't efficiently follow each other through the road
      if (minFollowUp > serviceTime) {
        return {
          valid: false,
          error: `minFollowUp (${minFollowUp}s) exceeds service time (${serviceTime}s). This prevents efficient vehicle platooning.`
        };
      }

      // Check Queue A: minFollowUp should be reasonable compared to mean interarrival time
      // If minFollowUp is close to the mean interarrival time, platooning becomes impossible
      if (minFollowUp >= meanInterarrivalA * 0.90) {
        return {
          valid: false,
          error: `Queue A: minFollowUp (${minFollowUp}s) is too close to mean interarrival time (${meanInterarrivalA.toFixed(2)}s). Reduce arrival rate or minFollowUp.`
        };
      }

      // Check Queue B: same validation
      if (minFollowUp >= meanInterarrivalB * 0.90) {
        return {
          valid: false,
          error: `Queue B: minFollowUp (${minFollowUp}s) is too close to mean interarrival time (${meanInterarrivalB.toFixed(2)}s). Reduce arrival rate or minFollowUp.`
        };
      }
    }

    // ============================================================================
    // STEP 4: Check system utilization to prevent unstable queues
    // ============================================================================
    // Calculate total arrival rate (from both directions combined)
    const totalArrivalRate = (arrivalRateA + arrivalRateB) / 3600;  // vehicles per second

    // Calculate service rate (how many vehicles per second can use the road)
    // Service rate = 1 / service time
    const serviceRate = 1 / serviceTime;  // vehicles per second

    // Calculate utilization: ratio of arrival rate to service rate
    // WHY: Utilization represents the fraction of time the road is busy
    // If utilization >= 1.0, arrivals exceed service capacity and queues grow infinitely
    const utilization = totalArrivalRate / serviceRate;

    // Reject if utilization is >= 99%
    // WHY: Even at 99%, queues become extremely long and unstable in practice
    // We use 0.99 threshold to ensure the system can reach steady state
    if (utilization >= 0.99) {
      return {
        valid: false,
        error: `System utilization (${(utilization * 100).toFixed(1)}%) is too high. Reduce arrival rates or service time.`
      };
    }

    // All validation checks passed
    return { valid: true };
  }
  
  /**
   * QueueSimulation class: Implements a discrete-event simulation of a two-way passing zone
   *
   * SIMULATION CONCEPT:
   * - Models a single-lane road segment where vehicles from two directions (A and B) must take turns
   * - Uses discrete-event simulation: time jumps from event to event (arrivals/departures)
   * - Events are processed in chronological order using a priority queue (min-heap)
   * - Tracks queue lengths, delays, utilization, and other performance metrics
   */
  class QueueSimulation {
    /**
     * Constructor: Initializes all state variables for the simulation
     * @param {number|null} seed - Random seed for reproducibility; null uses random seed
     */
    constructor(seed = null) {
      // ============================================================================
      // RANDOM NUMBER GENERATION
      // ============================================================================
      this.seed = seed;
      // Create a deterministic random number generator using the provided or generated seed
      // WHY: Allows reproducible simulations when testing or comparing scenarios
      this.rng = this.createRNG(seed || Math.floor(Math.random() * 1000000));

      // ============================================================================
      // EVENT MANAGEMENT
      // ============================================================================
      // Priority queue (min-heap) storing all future events as [time, type, direction]
      // WHY: Discrete-event simulation processes events in chronological order
      this.events = [];

      // ============================================================================
      // QUEUE STATE TRACKING
      // ============================================================================
      // Current number of vehicles waiting in each queue [A, B]
      this.queueLengths = [0, 0];

      // ============================================================================
      // ROAD STATE TRACKING
      // ============================================================================
      // Is any vehicle currently using the single-lane road?
      this.roadOccupied = false;

      // Which direction currently controls the road? null if empty, 0 for A, 1 for B
      // WHY: Road can only be used by one direction at a time; switching has implications
      this.roadDirection = null;

      // OPTIMIZATION: Instead of tracking an array of all vehicles on the road,
      // we only track the next departure time and which direction it's from
      // WHY: For simulation logic, we only need to know when the next car leaves
      this.nextDepartureTime = null;          // When will the next vehicle depart?
      this.nextDepartureDirection = null;     // From which direction?
      this.carsOnRoadCount = 0;               // How many cars are currently on the road?

      // ============================================================================
      // TIMING CONSTRAINTS TRACKING
      // ============================================================================
      // Last time a vehicle entered from each direction [A, B]
      // WHY: Needed to enforce minFollowUp constraint (minimum gap between same-direction entries)
      this.lastEntryTime = [null, null];

      // ============================================================================
      // STATISTICS COLLECTION: Queue Length Distribution
      // ============================================================================
      // For each direction, maps queue length -> total time spent at that length
      // Example: queueTime[0][3] = 150 means Queue A had 3 vehicles for 150 seconds total
      // WHY: Allows us to calculate the percentage of time at each queue length
      this.queueTime = [{}, {}];

      // Timestamp of the last processed event (for calculating time intervals)
      this.lastEventTime = 0;

      // Array to track maximum queue length observed in each hour
      // WHY: Users want to know peak queue lengths over time
      this.hourlyMaxLength = [];

      // Arrays to track hours with passing conflicts (when opposite direction blocks entry)
      // WHY: Users want to know when congestion from opposing traffic occurred
      this.hourlyConflicts = [new Set(), new Set()]; // Sets of hour indices where conflicts occurred

      // ============================================================================
      // STATISTICS COLLECTION: Arrival Classifications
      // ============================================================================
      // Total vehicles that arrived from each direction
      this.totalArrivals = [0, 0];

      // How many arrivals had to join a queue vs. entered road immediately
      this.arrivalsQueued = [0, 0];      // Had to wait
      this.arrivalsImmediate = [0, 0];   // Entered road immediately upon arrival

      // Classification of queued arrivals by road state at arrival time:
      this.arrivalsNone = [0, 0];        // Road was empty when vehicle arrived but still had to queue
      this.arrivalsSame = [0, 0];        // Road was occupied by same direction
      this.arrivalsOpposite = [0, 0];    // Road was occupied by opposite direction

      // ============================================================================
      // STATISTICS COLLECTION: Delay Metrics
      // ============================================================================
      // OPTIMIZATION: Use running sums instead of storing individual delay times
      // WHY: Saves massive amounts of memory for long simulations with many vehicles
      this.totalDelayTime = [0, 0];      // Sum of all delays for all vehicles
      this.queuedDelayTime = [0, 0];     // Sum of delays only for vehicles that queued
      this.vehicleCount = [0, 0];        // Total vehicles that entered the road
      this.queuedVehicleCount = [0, 0];  // Vehicles that had to wait before entering

      // ============================================================================
      // QUEUE MANAGEMENT
      // ============================================================================
      // OPTIMIZATION: Lightweight queue structure storing only necessary info
      // Each entry: { arrivalTime: number, direction: 0|1 }
      // WHY: We don't need unique IDs or other metadata; just arrival time and direction
      this.fcfsQueue = [];

      // Redundant counter (queueLengths already tracks this)
      // Could potentially be removed as an optimization
      this.queueCounts = [0, 0];

      // ============================================================================
      // STATISTICS COLLECTION: Road Utilization
      // ============================================================================
      // Array of time periods when road was occupied (any direction)
      // Each entry: { start: time, end: time }
      // WHY: Used to calculate overall road utilization percentage
      this.roadOccupancyPeriods = [];

      // Array of time periods when road was occupied by each specific direction
      // directionalOccupancy[0] = periods for direction A, [1] = periods for direction B
      // WHY: Used to calculate directional utilization (how much each direction used the road)
      this.directionalOccupancy = [[], []];
    }

    /**
     * Creates a Linear Congruential Generator (LCG) for pseudo-random number generation
     * @param {number} seed - Initial seed value
     * @returns {Function} - Function that returns random numbers in [0, 1)
     *
     * ALGORITHM: Linear Congruential Generator
     * Formula: X(n+1) = (a * X(n) + c) mod m
     * Where: a = 1664525, c = 1013904223, m = 2^32 (standard parameters)
     * WHY: Deterministic RNG allows reproducible simulations for testing and validation
     */
    createRNG(seed) {
      let state = seed;
      return function() {
        // Update state using LCG formula
        state = (state * 1664525 + 1013904223) % Math.pow(2, 32);
        // Normalize to [0, 1) by dividing by m
        return state / Math.pow(2, 32);
      }
    }

    /**
     * Inserts an item into a min-heap, maintaining heap property
     * @param {Array} heap - The heap array (modified in place)
     * @param {Array} item - Item to insert [time, type, direction]
     *
     * WHY: Min-heap ensures we always process events in chronological order (O(log n) insertion)
     * Heap property: parent[0] <= children[0] (comparing timestamps)
     */
    heapPush(heap, item) {
      // Add item to end of array
      heap.push(item);
      // Restore heap property by bubbling up
      this.heapifyUp(heap, heap.length - 1);
    }

    /**
     * Removes and returns the minimum element (earliest event) from the heap
     * @param {Array} heap - The heap array (modified in place)
     * @returns {Array|null} - The minimum item [time, type, direction], or null if empty
     *
     * WHY: O(log n) extraction of earliest event maintains simulation efficiency
     */
    heapPop(heap) {
      if (heap.length === 0) return null;
      if (heap.length === 1) return heap.pop();

      // Save the minimum (root) element to return
      const result = heap[0];
      // Move last element to root
      heap[0] = heap.pop();
      // Restore heap property by bubbling down
      this.heapifyDown(heap, 0);
      return result;
    }

    /**
     * Restores heap property by moving an element up the tree
     * @param {Array} heap - The heap array
     * @param {number} index - Index of element to bubble up
     *
     * ALGORITHM: Compare with parent, swap if smaller, repeat until heap property restored
     */
    heapifyUp(heap, index) {
      while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        // If parent is smaller or equal, heap property is satisfied
        if (heap[parentIndex][0] <= heap[index][0]) break;
        // Swap with parent
        [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
        // Move up the tree
        index = parentIndex;
      }
    }

    /**
     * Restores heap property by moving an element down the tree
     * @param {Array} heap - The heap array
     * @param {number} index - Index of element to bubble down
     *
     * ALGORITHM: Compare with children, swap with smallest child if necessary, repeat
     */
    heapifyDown(heap, index) {
      while (true) {
        let minIndex = index;
        const leftChild = 2 * index + 1;
        const rightChild = 2 * index + 2;

        // Find smallest among current node and its children
        if (leftChild < heap.length && heap[leftChild][0] < heap[minIndex][0]) {
          minIndex = leftChild;
        }
        if (rightChild < heap.length && heap[rightChild][0] < heap[minIndex][0]) {
          minIndex = rightChild;
        }

        // If current node is smallest, heap property is satisfied
        if (minIndex === index) break;

        // Swap with smallest child
        [heap[index], heap[minIndex]] = [heap[minIndex], heap[index]];
        // Move down the tree
        index = minIndex;
      }
    }

    /**
     * Generates an exponentially distributed random variable
     * @param {number} rate - Rate parameter (λ) of exponential distribution
     * @returns {number} - Random value from Exp(rate) distribution
     *
     * MATHEMATICS: Exponential distribution models time between events in a Poisson process
     * Formula: X = -ln(U) / λ, where U ~ Uniform(0,1)
     * WHY: Vehicle arrivals follow Poisson process, so interarrival times are exponential
     */
    exponentialRandom(rate) {
      // Validate rate parameter
      if (!isFinite(rate) || rate <= 0) {
        console.warn('Invalid rate in exponentialRandom:', rate);
        return 1;
      }

      // Get uniform random number in (0, 1)
      const u = this.rng();
      // Ensure u is not exactly 0 (would cause -Infinity in log)
      const safeU = Math.max(u, 1e-10);

      // Apply inverse transform: X = -ln(U) / λ
      return -Math.log(safeU) / rate;
    }

    /**
     * Generates interarrival time with a minimum gap constraint
     * @param {number} targetRate - Desired arrival rate (vehicles per second)
     * @param {number} minGap - Minimum time between consecutive arrivals (seconds)
     * @returns {number} - Time until next arrival (seconds)
     *
     * MATHEMATICS: To maintain target mean arrival rate with minimum gap:
     * - Original mean = 1/rate
     * - With minGap: interarrival = minGap + Exp(adjusted_rate)
     * - To preserve mean: adjusted_rate = 1/(original_mean - minGap)
     * WHY: Prevents vehicles from arriving too close together (safety/realism)
     */
    adjustedInterarrival(targetRate, minGap) {
      // If no minimum gap, use standard exponential distribution
      if (minGap === 0) {
        return this.exponentialRandom(targetRate);
      }

      // Calculate the target mean interarrival time
      const targetMean = 1 / targetRate;

      // Validation: minGap shouldn't exceed mean (caught earlier, but double-check)
      if (minGap >= targetMean) {
        console.warn('minGap exceeds target mean interarrival time');
        return minGap;
      }

      // Adjusted mean for the exponential component
      // Since total = minGap + Exp(adjusted), we want: minGap + adjusted_mean = targetMean
      const adjustedMean = targetMean - minGap;

      // Safety check for numerical issues
      if (adjustedMean <= 0) {
        console.warn('Adjusted mean is non-positive:', adjustedMean);
        return minGap + 1;
      }

      // Calculate adjusted rate: λ = 1 / adjusted_mean
      const adjustedRate = 1 / adjustedMean;

      // Return: minGap + exponentially distributed time
      // This ensures minimum gap while preserving overall arrival rate
      return minGap + this.exponentialRandom(adjustedRate);
    }

    /**
     * Checks if a vehicle from a given direction can enter the single-lane road
     * @param {number} direction - 0 for direction A, 1 for direction B
     * @param {number} currentTime - Current simulation time (seconds)
     * @param {number} minFollowUp - Minimum time between consecutive vehicles from same direction
     * @returns {boolean} - true if vehicle can enter, false otherwise
     *
     * LOGIC: A vehicle can enter if:
     * 1. Road is empty, OR
     * 2. Road is occupied by same direction AND minFollowUp constraint is satisfied
     * WHY: Safety constraint - vehicles from opposite directions can't use road simultaneously
     */
    canEnterRoad(direction, currentTime, minFollowUp) {
      // If road is empty, vehicle can always enter
      if (!this.roadOccupied) return true;

      // If road is occupied by opposite direction, vehicle must wait
      // WHY: This is the fundamental constraint of a single-lane road
      if (this.roadDirection !== null && this.roadDirection !== direction) {
        return false;
      }

      // If minFollowUp constraint exists, check if enough time has passed since last entry
      // WHY: minFollowUp ensures adequate spacing between consecutive vehicles from same direction
      if (minFollowUp > 0 && this.lastEntryTime[direction] !== null) {
        const timeSinceLastEntry = currentTime - this.lastEntryTime[direction];
        return timeSinceLastEntry >= minFollowUp;
      }

      // If same direction and no minFollowUp violation, vehicle can enter
      return true;
    }

    /**
     * Checks if an arriving vehicle can skip the queue and enter immediately
     * @param {number} direction - 0 for direction A, 1 for direction B
     * @param {string} priorityScheme - 'FCFS', 'A', or 'B'
     * @returns {boolean} - true if vehicle can skip queue, false otherwise
     *
     * QUEUEING DISCIPLINE:
     * - FCFS (First-Come-First-Served): Can skip only if no one is waiting
     * - Priority A: Can skip if no A vehicles are waiting (A has priority)
     * - Priority B: Can skip if no B vehicles are waiting (B has priority)
     * WHY: Prevents queue-jumping; maintains fairness based on selected discipline
     */
    canSkipQueue(direction, priorityScheme) {
      if (priorityScheme === 'FCFS') {
        // Under FCFS, must join queue if anyone is waiting
        return this.fcfsQueue.length === 0;
      }

      if (priorityScheme === 'A') {
        // Priority A: A vehicles can skip if no A is waiting; B must wait if any A is waiting
        return this.queueLengths[0] === 0;
      } else if (priorityScheme === 'B') {
        // Priority B: B vehicles can skip if no B is waiting; A must wait if any B is waiting
        return this.queueLengths[1] === 0;
      }

      // Default case (shouldn't reach here with valid priority scheme)
      // But if it does, check if the arriving vehicle's direction queue is empty
      return this.queueLengths[direction] === 0;
    }

    /**
     * Places a vehicle onto the single-lane road and schedules its departure
     * @param {number} direction - 0 for direction A, 1 for direction B
     * @param {number} currentTime - Current simulation time (seconds)
     * @param {number} actualServiceTime - Time for vehicle to traverse the road (seconds)
     * @param {number|null} arrivalTime - When vehicle originally arrived (for delay calculation)
     *
     * ACTIONS PERFORMED:
     * 1. Update road occupancy state (if transitioning from empty or changing direction)
     * 2. Schedule vehicle's departure event
     * 3. Update timing constraints (lastEntryTime)
     * 4. Calculate and record delay statistics
     */
    enterRoad(direction, currentTime, actualServiceTime, arrivalTime = null) {
      // ========================================================================
      // STEP 1: Update road occupancy tracking
      // ========================================================================
      if (!this.roadOccupied) {
        // Road was empty, now becoming occupied
        this.roadOccupied = true;
        this.roadDirection = direction;

        // Start a new overall occupancy period
        this.roadOccupancyPeriods.push({start: currentTime, end: null});

        // Start a new directional occupancy period
        this.directionalOccupancy[direction].push({start: currentTime, end: null});
      } else if (this.roadDirection !== direction) {
        // Road direction is switching (A->B or B->A)
        // Close the previous direction's occupancy period
        this.closeDirectionalOccupancy(currentTime);

        // Update to new direction
        this.roadDirection = direction;

        // Start new directional occupancy period for the new direction
        this.directionalOccupancy[direction].push({start: currentTime, end: null});
      }
      // (If road is already occupied by same direction, no state change needed)

      // ========================================================================
      // STEP 2: Schedule departure event
      // ========================================================================
      const departureTime = currentTime + actualServiceTime;

      // OPTIMIZATION: Track only the next departure time (not all vehicles)
      // WHY: Saves memory; we only need earliest departure for road state updates
      this.carsOnRoadCount++;
      if (this.nextDepartureTime === null || departureTime < this.nextDepartureTime) {
        this.nextDepartureTime = departureTime;
        this.nextDepartureDirection = direction;
      }

      // ========================================================================
      // STEP 3: Record entry time for minFollowUp constraint
      // ========================================================================
      this.lastEntryTime[direction] = currentTime;

      // ========================================================================
      // STEP 4: Calculate delay statistics
      // ========================================================================
      // OPTIMIZATION: Accumulate delay sums immediately instead of storing all delays
      // WHY: Saves massive memory for long simulations with thousands of vehicles
      if (arrivalTime !== null) {
        const delay = currentTime - arrivalTime;  // How long did vehicle wait?

        // Add to total delay sum (includes vehicles with zero delay)
        this.totalDelayTime[direction] += delay;
        this.vehicleCount[direction]++;

        // Track queued delays separately (only vehicles that actually waited)
        if (delay > 0) {
          this.queuedDelayTime[direction] += delay;
          this.queuedVehicleCount[direction]++;
        }
      }

      // ========================================================================
      // STEP 5: Add departure event to event queue
      // ========================================================================
      this.heapPush(this.events, [departureTime, 'departure', direction]);
    }

    /**
     * Updates road occupancy state after processing departure events
     * @param {number} currentTime - Current simulation time (seconds)
     *
     * PURPOSE: Maintains accurate road state after vehicles depart
     * Called before processing each event to ensure state is current
     *
     * LOGIC:
     * 1. If next departure time has passed, decrement car count and find new next departure
     * 2. If no cars remain, close occupancy periods and mark road as empty
     * 3. If road direction changes (all cars from one direction departed), update direction
     */
    updateRoadOccupancy(currentTime) {
      // ========================================================================
      // STEP 1: Check if a departure should have occurred by now
      // ========================================================================
      // OPTIMIZATION: Check only the tracked next departure time, not all vehicles
      if (this.nextDepartureTime !== null && currentTime >= this.nextDepartureTime) {
        // A vehicle has departed
        this.carsOnRoadCount--;

        if (this.carsOnRoadCount === 0) {
          // No more vehicles on road
          this.nextDepartureTime = null;
          this.nextDepartureDirection = null;
        } else {
          // Still vehicles on road - find the new next departure
          // Scan the event queue for the earliest future departure event
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

      // ========================================================================
      // STEP 2: Update road state based on remaining vehicles
      // ========================================================================
      if (this.carsOnRoadCount === 0) {
        // Road is now empty
        if (this.roadOccupied) {
          // Close the overall occupancy period
          const lastPeriod = this.roadOccupancyPeriods[this.roadOccupancyPeriods.length - 1];
          if (lastPeriod && lastPeriod.end === null) {
            lastPeriod.end = currentTime;
          }
          // Close the directional occupancy period
          this.closeDirectionalOccupancy(currentTime);
        }
        // Mark road as unoccupied
        this.roadOccupied = false;
        this.roadDirection = null;
      } else if (this.nextDepartureDirection !== null && this.roadDirection !== this.nextDepartureDirection) {
        // Road direction has changed (all vehicles from old direction have departed)
        // Close the previous direction's occupancy period
        this.closeDirectionalOccupancy(currentTime);

        // Update to the new direction
        this.roadDirection = this.nextDepartureDirection;

        // Start a new occupancy period for the new direction
        this.directionalOccupancy[this.nextDepartureDirection].push({start: currentTime, end: null});
      }
    }

    /**
     * Closes the current directional occupancy period
     * @param {number} currentTime - Current simulation time (seconds)
     *
     * PURPOSE: Finalizes the time period during which a specific direction controlled the road
     * WHY: Needed for calculating directional utilization statistics
     */
    closeDirectionalOccupancy(currentTime) {
      if (this.roadDirection !== null) {
        // Get the occupancy periods array for the current direction
        const periods = this.directionalOccupancy[this.roadDirection];
        if (periods.length > 0) {
          // Find the most recent period (should have end=null if still active)
          const lastPeriod = periods[periods.length - 1];
          if (lastPeriod && lastPeriod.end === null) {
            // Close the period by setting its end time
            lastPeriod.end = currentTime;
          }
        }
      }
    }

    /**
     * Selects the next waiting vehicle to enter the road based on priority scheme
     * @param {string} priorityScheme - 'FCFS', 'A', or 'B'
     * @param {number} currentTime - Current simulation time (seconds)
     * @param {number} minFollowUp - Minimum time between consecutive vehicles from same direction
     * @returns {Object|null} - Customer object {arrivalTime, direction} or null if none eligible
     *
     * PRIORITY SCHEMES:
     * - FCFS: First vehicle in queue (regardless of direction) that can enter
     * - Priority A: Serve A vehicles first, then B vehicles
     * - Priority B: Serve B vehicles first, then A vehicles
     * WHY: Different schemes affect fairness and average delays for each direction
     */
    selectNextQueue(priorityScheme, currentTime, minFollowUp) {
      if (priorityScheme === 'FCFS') {
        // ========================================================================
        // FCFS (First-Come-First-Served): Serve in arrival order
        // ========================================================================
        // OPTIMIZATION: Find first valid customer in one pass through the queue
        // WHY: Queue is already ordered by arrival time
        for (let i = 0; i < this.fcfsQueue.length; i++) {
          const customer = this.fcfsQueue[i];
          // Check if this customer can enter road (considering minFollowUp constraint)
          if (this.canEnterRoad(customer.direction, currentTime, minFollowUp)) {
            // Remove customer from queue and return
            this.fcfsQueue.splice(i, 1);
            return customer;
          }
        }
        // No eligible customer found (all blocked by minFollowUp constraint)
        return null;

      } else if (priorityScheme === 'A') {
        // ========================================================================
        // Priority A: Direction A has priority over direction B
        // ========================================================================
        // STEP 1: Try to serve a vehicle from direction A first
        if (this.queueLengths[0] > 0 && this.canEnterRoad(0, currentTime, minFollowUp)) {
          const customer = this.fcfsQueue.find(c => c.direction === 0);
          if (customer) {
            const index = this.fcfsQueue.indexOf(customer);
            this.fcfsQueue.splice(index, 1);
            return customer;
          }
        }
        // STEP 2: If no A vehicle can be served, try direction B
        if (this.queueLengths[1] > 0 && this.canEnterRoad(1, currentTime, minFollowUp)) {
          const customer = this.fcfsQueue.find(c => c.direction === 1);
          if (customer) {
            const index = this.fcfsQueue.indexOf(customer);
            this.fcfsQueue.splice(index, 1);
            return customer;
          }
        }

      } else if (priorityScheme === 'B') {
        // ========================================================================
        // Priority B: Direction B has priority over direction A
        // ========================================================================
        // STEP 1: Try to serve a vehicle from direction B first
        if (this.queueLengths[1] > 0 && this.canEnterRoad(1, currentTime, minFollowUp)) {
          const customer = this.fcfsQueue.find(c => c.direction === 1);
          if (customer) {
            const index = this.fcfsQueue.indexOf(customer);
            this.fcfsQueue.splice(index, 1);
            return customer;
          }
        }
        // STEP 2: If no B vehicle can be served, try direction A
        if (this.queueLengths[0] > 0 && this.canEnterRoad(0, currentTime, minFollowUp)) {
          const customer = this.fcfsQueue.find(c => c.direction === 0);
          if (customer) {
            const index = this.fcfsQueue.indexOf(customer);
            this.fcfsQueue.splice(index, 1);
            return customer;
          }
        }
      }

      // No eligible customer found
      return null;
    }

    /**
     * Records queue length statistics over a time interval
     * @param {number} currentTime - Current simulation time (seconds)
     *
     * PURPOSE: Tracks how long each queue spent at each length
     * Called before processing each event to capture state changes
     *
     * STATISTICS COLLECTED:
     * - Time-weighted queue length distribution
     * - Maximum queue length per hour
     * WHY: Allows calculation of percentages of time at each queue length
     */
    recordTime(currentTime) {
      // Calculate time elapsed since last event
      const dt = currentTime - this.lastEventTime;

      // For both directions (A and B)
      for (let i = 0; i < 2; i++) {
        // Get current queue length
        const qLen = this.queueLengths[i];

        // Add elapsed time to the total time spent at this queue length
        // WHY: This creates a time-weighted histogram of queue lengths
        // Example: If queue had 3 cars for 50 seconds, queueTime[i][3] += 50
        this.queueTime[i][qLen] = (this.queueTime[i][qLen] || 0) + dt;

        // Update hourly maximum queue length
        // Determine which hour we're in (capped at last hour to prevent index overflow)
        const hourIdx = Math.min(Math.floor(currentTime / 3600), this.numHours - 1);

        // Update the maximum observed queue length for this hour if current length is larger
        // WHY: Tracks peak congestion periods
        this.hourlyMaxLength[i][hourIdx] = Math.max(
          this.hourlyMaxLength[i][hourIdx] || 0,
          qLen
        );
      }

      // Update last event time for next interval calculation
      this.lastEventTime = currentTime;
    }

    /**
     * Calculates overall road utilization percentage
     * @param {number} simulationTime - Total simulation duration (seconds)
     * @returns {number} - Utilization percentage (0-100)
     *
     * PURPOSE: Determines what percentage of time the road was occupied by any vehicle
     * WHY: Key performance metric indicating how efficiently the road is being used
     */
    calculateRoadUtilization(simulationTime) {
      let totalOccupiedTime = 0;

      // Sum up all time periods when road was occupied
      for (const period of this.roadOccupancyPeriods) {
        // If period is still open (simulation ended while road occupied), use simulationTime as end
        const endTime = period.end !== null ? period.end : simulationTime;
        totalOccupiedTime += endTime - period.start;
      }

      // Calculate utilization as percentage
      const utilization = (totalOccupiedTime / simulationTime) * 100;

      // Return safe value (prevent NaN or Infinity)
      return isFinite(utilization) ? utilization : 0;
    }

    /**
     * Calculates utilization percentage for each direction
     * @param {number} simulationTime - Total simulation duration (seconds)
     * @returns {Array<number>} - [utilizationA, utilizationB] as percentages (0-100)
     *
     * PURPOSE: Determines what percentage of time the road was used by each direction
     * WHY: Shows balance/imbalance between directions; helps identify if one direction dominates
     */
    calculateDirectionalUtilization(simulationTime) {
      const directionalTimes = [0, 0];

      // For each direction, sum up all occupancy periods
      for (let direction = 0; direction < 2; direction++) {
        for (const period of this.directionalOccupancy[direction]) {
          // If period is still open, use simulationTime as end
          const endTime = period.end !== null ? period.end : simulationTime;
          directionalTimes[direction] += endTime - period.start;
        }
      }

      // Return utilization percentages for both directions
      return [
        isFinite(directionalTimes[0]) ? (directionalTimes[0] / simulationTime) * 100 : 0,
        isFinite(directionalTimes[1]) ? (directionalTimes[1] / simulationTime) * 100 : 0
      ];
    }

    /**
     * Main simulation function: Runs a discrete-event simulation of the two-way passing zone
     * @param {Object} params - Simulation parameters
     * @returns {Object} - Simulation results with queue statistics, delays, and utilization
     *
     * DISCRETE-EVENT SIMULATION CONCEPT:
     * - Time progresses by jumping from event to event (not in fixed increments)
     * - Events (arrivals, departures) are processed in chronological order
     * - System state (queues, road occupancy) is updated at each event
     * - Statistics are collected continuously throughout the simulation
     *
     * KEY STEPS:
     * 1. Initialize and schedule first arrivals
     * 2. Process events in chronological order until simulation time expires
     * 3. Finalize statistics and return results
     */
    simulate(params) {
      // ========================================================================
      // STEP 1: Extract simulation parameters
      // ========================================================================
      const {
        arrivalRateA,      // Vehicles/hour from direction A
        arrivalRateB,      // Vehicles/hour from direction B
        serviceTime,       // Time (seconds) to traverse the road (cruising)
        queuedServiceTime, // Time (seconds) for queued vehicle (pure travel time)
        simulationTime,    // Total simulation duration (seconds)
        minGap,            // Minimum gap between consecutive arrivals (seconds)
        minFollowUp,       // Minimum gap between same-direction entries (seconds)
        reactionDelay = 1.1,     // First car reaction delay (seconds)
        accelerationRate = 1.5,  // Acceleration rate (m/s²)
        segmentDistance = 30,    // Distance of segment (meters)
        vehicleSpeed = 20,       // Cruise speed (km/h)
        queueSpaceLength = 6.5,  // Distance between queued cars (meters)
        priorityScheme     // 'FCFS', 'A', or 'B'
      } = params;

      // Store the queued service time (pure travel time) and reaction parameters
      // The simulation will apply these separately based on wait reason
      this.queuedServiceTime = queuedServiceTime || serviceTime;
      this.reactionDelay = reactionDelay;
      this.minFollowUp = minFollowUp;

      // ========================================================================
      // STEP 2: Initialize hourly statistics tracking
      // ========================================================================
      this.numHours = Math.floor(simulationTime / 3600);
      // Initialize arrays to track maximum queue length observed in each hour
      this.hourlyMaxLength = [
        new Array(this.numHours).fill(0),  // Direction A
        new Array(this.numHours).fill(0)   // Direction B
      ];

      // ========================================================================
      // STEP 3: Convert arrival rates from per-hour to per-second
      // ========================================================================
      // WHY: Simulation time is in seconds, so we need rates in vehicles/second
      const arrivalRate = [
        arrivalRateA / 3600,  // Direction A: vehicles per second
        arrivalRateB / 3600   // Direction B: vehicles per second
      ];

      // ========================================================================
      // STEP 4: Bootstrap the simulation by scheduling first arrivals
      // ========================================================================
      // For each direction, generate time until first arrival and schedule the event
      for (let i = 0; i < 2; i++) {
        const firstArrival = this.adjustedInterarrival(arrivalRate[i], minGap);
        this.heapPush(this.events, [firstArrival, 'arrival', i]);
      }

      // ========================================================================
      // STEP 5: Main event loop - process events until simulation time expires
      // ========================================================================
      // WHY: This is the core of discrete-event simulation
      // Events are processed in chronological order from the priority queue
      while (this.events.length > 0) {
        // Extract earliest event from heap
        const event = this.heapPop(this.events);
        const [eventTime, eventType, qIndex] = event;

        // Stop if event occurs after simulation end time
        if (eventTime > simulationTime) break;

        // Before processing event, record time-weighted statistics
        this.recordTime(eventTime);

        // Update road state based on any departures that should have occurred
        this.updateRoadOccupancy(eventTime);

        // ====================================================================
        // EVENT TYPE 1: ARRIVAL - A vehicle arrives from one direction
        // ====================================================================
        if (eventType === 'arrival') {
          // Increment arrival counter
          this.totalArrivals[qIndex]++;

          // Decide: Can vehicle enter road immediately or must it queue?
          // Requires: (1) Physical ability to enter, (2) No queue-jumping
          if (this.canEnterRoad(qIndex, eventTime, minFollowUp) &&
              this.canSkipQueue(qIndex, priorityScheme)) {
            // Vehicle enters road immediately without queuing (uses cruising service time)
            this.enterRoad(qIndex, eventTime, serviceTime, eventTime);
            this.arrivalsImmediate[qIndex]++;
          } else {
            // Vehicle must join queue
            this.queueLengths[qIndex]++;
            this.arrivalsQueued[qIndex]++;

            // OPTIMIZATION: Store only essential info (arrival time and direction)
            this.fcfsQueue.push({
              arrivalTime: eventTime,
              direction: qIndex
            });

            // Classify why vehicle had to queue (for statistical analysis)
            if (this.roadOccupied) {
              if (this.roadDirection === qIndex) {
                // Road occupied by same direction (likely minFollowUp constraint)
                this.arrivalsSame[qIndex]++;
              } else {
                // Road occupied by opposite direction (fundamental constraint) - this is a conflict!
                this.arrivalsOpposite[qIndex]++;

                // Track passing conflict for this hour
                const hourIdx = Math.min(Math.floor(eventTime / 3600), this.numHours - 1);
                this.hourlyConflicts[qIndex].add(hourIdx);
              }
            } else {
              // Road empty but vehicle queued (priority scheme or queue discipline)
              this.arrivalsNone[qIndex]++;
            }
          }

          // Schedule next arrival for this direction
          // WHY: Arrivals continue throughout simulation (Poisson process)
          const dt = this.adjustedInterarrival(arrivalRate[qIndex], minGap);
          const nextArrival = eventTime + dt;
          this.heapPush(this.events, [nextArrival, 'arrival', qIndex]);

        // ====================================================================
        // EVENT TYPE 2: DEPARTURE - A vehicle finishes traversing the road
        // ====================================================================
        } else if (eventType === 'departure') {
          // After a departure, check if a waiting vehicle can now enter
          this.processQueueAfterDeparture(eventTime, priorityScheme);
        }
      }

      // ========================================================================
      // STEP 6: Finalize statistics at end of simulation
      // ========================================================================
      // Close any open occupancy periods (simulation ended while road occupied)
      if (this.roadOccupancyPeriods.length > 0) {
        const lastPeriod = this.roadOccupancyPeriods[this.roadOccupancyPeriods.length - 1];
        if (lastPeriod && lastPeriod.end === null) {
          lastPeriod.end = simulationTime;
        }
      }

      // Close any open directional occupancy periods
      this.closeDirectionalOccupancy(simulationTime);

      // ========================================================================
      // STEP 7: Calculate and return final results
      // ========================================================================
      return this.calculateResults(simulationTime);
    }

    /**
     * Processes the queue after a vehicle departs to admit the next waiting vehicle
     * @param {number} currentTime - Current simulation time (seconds)
     * @param {string} priorityScheme - 'FCFS', 'A', or 'B'
     *
     * PURPOSE: When a vehicle departs, check if any queued vehicle can now enter
     * WHY: Maximizes road utilization by immediately admitting next eligible vehicle
     */
    processQueueAfterDeparture(currentTime, priorityScheme) {
      // Select next customer based on priority scheme and constraints
      const nextCustomer = this.selectNextQueue(priorityScheme, currentTime, this.minFollowUp);

      if (nextCustomer !== null) {
        // Determine the total service time by applying reaction delay and/or follow-up to pure travel time:
        // - For opposite direction wait: reactionDelay + queuedServiceTime
        // - For same direction wait: max(reactionDelay, minFollowUp) + queuedServiceTime
        let totalServiceTime;
        if (this.roadOccupied && this.roadDirection === nextCustomer.direction) {
          // Vehicle is following another from same direction
          const waitTime = Math.max(this.reactionDelay, this.minFollowUp);
          totalServiceTime = waitTime + this.queuedServiceTime;
        } else {
          // Vehicle waited for opposite direction (or road was empty)
          totalServiceTime = this.reactionDelay + this.queuedServiceTime;
        }

        // Remove customer from queue and place on road
        this.queueLengths[nextCustomer.direction]--;
        // Pass arrivalTime to track delay (how long vehicle waited in queue)
        this.enterRoad(nextCustomer.direction, currentTime, totalServiceTime, nextCustomer.arrivalTime);
      }
      // If no customer selected, road may become empty or remain with existing vehicles
    }

    /**
     * Returns a safe numeric value, replacing NaN or Infinity with default
     * @param {number} value - Value to check
     * @param {number} defaultValue - Default value if invalid (default: 0)
     * @returns {number} - Safe value
     *
     * WHY: Prevents invalid values (NaN, Infinity) from appearing in results
     * Common cause: Division by zero or other numerical edge cases
     */
    safeValue(value, defaultValue = 0) {
      return (isFinite(value) && !isNaN(value)) ? value : defaultValue;
    }

    /**
     * Processes raw simulation statistics into formatted results
     * @param {number} simulationTime - Total simulation duration (seconds)
     * @returns {Object} - Comprehensive results object with all statistics
     *
     * PURPOSE: Converts accumulated statistics into user-friendly percentages and averages
     * WHY: Raw data (like time-weighted queue lengths) must be normalized for interpretation
     *
     * RESULTS STRUCTURE:
     * - queues: Queue length distributions and hourly maximums
     * - serverUtilization: Overall road occupancy percentage
     * - directionalUtilization: Per-direction road usage percentages
     * - arrivalRates: Breakdown of arrival patterns by road state
     * - delays: Average delays for all vehicles and queued vehicles
     */
    calculateResults(simulationTime) {
      // ========================================================================
      // STEP 1: Initialize results structure with calculated road utilization
      // ========================================================================
      const results = {
        queues: [],
        // Overall road utilization: percentage of time road had any vehicle
        serverUtilization: this.safeValue(this.calculateRoadUtilization(simulationTime)),
        // Directional utilization: percentage of time each direction used road
        directionalUtilization: this.calculateDirectionalUtilization(simulationTime).map(v => this.safeValue(v)),
        arrivalRates: [],
        delays: [],
        totalArrivals: this.totalArrivals.slice()  // Copy array
      };

      // ========================================================================
      // STEP 2: Calculate statistics for each direction (A and B)
      // ========================================================================
      for (let i = 0; i < 2; i++) {
        const queueName = i === 0 ? 'Queue A' : 'Queue B';

        // ====================================================================
        // SUBSTEP 2.1: Calculate queue length distribution percentages
        // ====================================================================
        // Total simulation time is the sum of all time-weighted queue length periods
        const totalTime = Object.values(this.queueTime[i]).reduce((sum, time) => sum + time, 0);

        // Convert absolute times to percentages
        // Example: If queue had 3 cars for 150 seconds out of 1000 total, that's 15%
        const lengthPercentages = {};
        for (const [length, time] of Object.entries(this.queueTime[i])) {
          const percentage = totalTime > 0 ? (time / totalTime) * 100 : 0;
          lengthPercentages[length] = this.safeValue(percentage);
        }

        // ====================================================================
        // SUBSTEP 2.2: Calculate hourly maximum queue length distribution
        // ====================================================================
        // Count how many hours had each maximum queue length
        // Example: If max was 5 in 3 hours and 6 in 2 hours, maxCounts = {5: 3, 6: 2}
        const maxCounts = {};
        for (const hourMax of this.hourlyMaxLength[i]) {
          maxCounts[hourMax] = (maxCounts[hourMax] || 0) + 1;
        }

        // Convert counts to percentages of total hours
        // Example: If 3 out of 10 hours had max=5, that's 30%
        const maxPercentages = {};
        for (const [length, count] of Object.entries(maxCounts)) {
          const percentage = this.numHours > 0 ? (count / this.numHours) * 100 : 0;
          maxPercentages[length] = this.safeValue(percentage);
        }

        // Add queue statistics to results
        results.queues.push({
          name: queueName,
          lengthPercentages,  // % of time at each queue length
          maxPercentages       // % of hours with each maximum queue length
        });

        // ====================================================================
        // SUBSTEP 2.3: Calculate arrival rate statistics by road state
        // ====================================================================
        // Convert simulation time to hours for per-hour rates
        const hoursSimulated = simulationTime / 3600;

        // Calculate arrival rates per hour for each road state category
        // WHY: Shows how road occupancy affects arrival patterns
        const rateSamePerHour = hoursSimulated > 0 ? this.arrivalsSame[i] / hoursSimulated : 0;
        const rateOppositePerHour = hoursSimulated > 0 ? this.arrivalsOpposite[i] / hoursSimulated : 0;
        const rateNonePerHour = hoursSimulated > 0 ? this.arrivalsNone[i] / hoursSimulated : 0;
        const totalPerHour = hoursSimulated > 0 ? this.totalArrivals[i] / hoursSimulated : 0;

        results.arrivalRates.push({
          name: queueName,
          sameQueue: this.safeValue(rateSamePerHour),        // Arrivals/hour when same direction occupied road
          oppositeQueue: this.safeValue(rateOppositePerHour),  // Arrivals/hour when opposite direction occupied road
          noqueue: this.safeValue(rateNonePerHour),           // Arrivals/hour when road was empty
          totalPerHour: this.safeValue(totalPerHour)          // Total arrivals per hour
        });

        // ====================================================================
        // SUBSTEP 2.4: Calculate average delay statistics
        // ====================================================================
        // Average delay for ALL vehicles (including those with zero delay)
        const avgDelayAllVehicles = this.vehicleCount[i] > 0 ?
          this.totalDelayTime[i] / this.vehicleCount[i] : 0;

        // Average delay for only vehicles that had to wait (excludes zero-delay vehicles)
        // WHY: This metric shows actual queueing delay when congestion occurs
        const avgDelayQueuedVehicles = this.queuedVehicleCount[i] > 0 ?
          this.queuedDelayTime[i] / this.queuedVehicleCount[i] : 0;

        // Calculate percentage of hours with passing conflicts
        const conflictPercentage = this.numHours > 0 ?
          (this.hourlyConflicts[i].size / this.numHours) * 100 : 0;

        results.delays.push({
          name: queueName,
          avgDelayAll: this.safeValue(avgDelayAllVehicles),           // Average delay across all vehicles
          avgDelayQueued: this.safeValue(avgDelayQueuedVehicles),     // Average delay for queued vehicles
          totalVehicles: this.vehicleCount[i],                         // Total vehicles that entered road
          queuedVehicles: this.queuedVehicleCount[i],                 // Vehicles that had to wait
          conflictPercentage: this.safeValue(conflictPercentage)      // % of hours with passing conflicts
        });
      }

      // ========================================================================
      // STEP 3: Return complete results object
      // ========================================================================
      return results;
    }
  }

  /**
   * Runs multiple simulation replications with different random seeds and averages results
   * @param {Object} params - Simulation parameters including numSeeds and seedMode
   * @returns {Object} - Averaged results across all simulation replications
   *
   * PURPOSE: Reduces simulation variability by averaging multiple independent runs
   * WHY: Stochastic simulations have random variation; averaging provides more reliable estimates
   *
   * METHODOLOGY:
   * - Run simulation multiple times with different random seeds
   * - Aggregate results using streaming accumulation (memory-efficient)
   * - Calculate averages across all replications
   * - Fixed seed mode: Seeds 1, 2, 3, ... (reproducible)
   * - Random seed mode: Random seeds (different results each execution)
   */
  async function runMultipleSimulations(params) {
    // Extract replication parameters
    const numSeeds = params.numSeeds;       // How many times to run the simulation
    const seedMode = params.seedMode;       // 'fixed' or 'random'

    // ========================================================================
    // STEP 1: Initialize accumulator variables for streaming aggregation
    // ========================================================================
    // OPTIMIZATION: Stream data instead of storing all results in memory
    // WHY: For many replications, storing all results would use excessive memory

    // Accumulate utilization statistics
    let totalServerUtil = 0;
    let totalDirectionalUtil = [0, 0];

    // Accumulate queue statistics (keyed by queue length)
    const aggregateQueueTime = [{}, {}];     // Sum of time percentages for each queue length
    const aggregateMaxCounts = [{}, {}];     // Sum of hour percentages for each max queue length

    // Accumulate arrival rate statistics
    const aggregateArrivalRates = [
      { same: 0, opposite: 0, noqueue: 0, total: 0 },
      { same: 0, opposite: 0, noqueue: 0, total: 0 }
    ];

    // Accumulate delay statistics
    const aggregateDelays = [
      { delayAll: 0, delayQueued: 0, totalVehicles: 0, queuedVehicles: 0, conflicts: 0 },
      { delayAll: 0, delayQueued: 0, totalVehicles: 0, queuedVehicles: 0, conflicts: 0 }
    ];

    // ========================================================================
    // STEP 2: Run simulation multiple times with different seeds
    // ========================================================================
    for (let i = 1; i <= numSeeds; i++) {
      // ====================================================================
      // SUBSTEP 2.1: Generate seed for this replication
      // ====================================================================
      let seed;
      if (seedMode === 'fixed') {
        // Fixed mode: Use sequential seeds (1, 2, 3, ...)
        // WHY: Makes results reproducible for testing and validation
        seed = i;
      } else {
        // Random mode: Use random seed for each replication
        // WHY: Ensures statistical independence between replications
        seed = Math.floor(Math.random() * 1000000);
      }

      // ====================================================================
      // SUBSTEP 2.2: Create new simulation and run it
      // ====================================================================
      const simulation = new QueueSimulation(seed);
      const result = simulation.simulate({
        arrivalRateA: params.arrivalRateA,
        arrivalRateB: params.arrivalRateB,
        serviceTime: params.serviceTime,
        queuedServiceTime: params.queuedServiceTime || params.serviceTime,
        simulationTime: params.simulationTime,
        minGap: params.minGap || 0,
        minFollowUp: params.minFollowUp || 0,
        reactionDelay: params.reactionDelay || 1.1,
        accelerationRate: params.accelerationRate || 1.5,
        segmentDistance: params.segmentDistance || 30,
        vehicleSpeed: params.vehicleSpeed || 20,
        queueSpaceLength: params.queueSpaceLength || 6.5,
        priorityScheme: params.priorityScheme
      });

      // ====================================================================
      // SUBSTEP 2.3: Accumulate results from this replication
      // ====================================================================
      // OPTIMIZATION: Accumulate directly without storing individual results
      // WHY: Saves memory when running hundreds or thousands of replications

      // Accumulate utilization
      totalServerUtil += result.serverUtilization;
      totalDirectionalUtil[0] += result.directionalUtilization[0];
      totalDirectionalUtil[1] += result.directionalUtilization[1];

      // Accumulate statistics for both directions
      for (let j = 0; j < 2; j++) {
        // Accumulate queue length percentages
        // Note: Different replications may have different queue lengths observed
        for (const [length, percent] of Object.entries(result.queues[j].lengthPercentages)) {
          aggregateQueueTime[j][length] = (aggregateQueueTime[j][length] || 0) + percent;
        }

        // Accumulate hourly maximum percentages
        for (const [length, percent] of Object.entries(result.queues[j].maxPercentages)) {
          aggregateMaxCounts[j][length] = (aggregateMaxCounts[j][length] || 0) + percent;
        }

        // Accumulate arrival rates by road state
        aggregateArrivalRates[j].same += result.arrivalRates[j].sameQueue;
        aggregateArrivalRates[j].opposite += result.arrivalRates[j].oppositeQueue;
        aggregateArrivalRates[j].noqueue += result.arrivalRates[j].noqueue;
        aggregateArrivalRates[j].total += result.arrivalRates[j].totalPerHour;

        // Accumulate delay statistics
        aggregateDelays[j].delayAll += result.delays[j].avgDelayAll;
        aggregateDelays[j].delayQueued += result.delays[j].avgDelayQueued;
        aggregateDelays[j].totalVehicles += result.delays[j].totalVehicles;
        aggregateDelays[j].queuedVehicles += result.delays[j].queuedVehicles;
        aggregateDelays[j].conflicts += result.delays[j].conflictPercentage;
      }
    }

    // ========================================================================
    // STEP 3: Define helper function for safe averaging
    // ========================================================================
    /**
     * Calculates average, handling division by zero and invalid values
     * @param {number} value - Sum of values
     * @param {number} divisor - Number of values
     * @returns {number} - Safe average
     */
    const safeAverage = (value, divisor) => {
      const result = divisor > 0 ? value / divisor : 0;
      return (isFinite(result) && !isNaN(result)) ? result : 0;
    };

    // ========================================================================
    // STEP 4: Calculate averaged results
    // ========================================================================
    const avgResults = {
      queues: [],
      // Average utilization across all replications
      serverUtilization: safeAverage(totalServerUtil, numSeeds),
      directionalUtilization: [
        safeAverage(totalDirectionalUtil[0], numSeeds),
        safeAverage(totalDirectionalUtil[1], numSeeds)
      ],
      arrivalRates: [],
      delays: [],
      numSeeds: numSeeds  // Include metadata about how many replications were run
    };

    // ========================================================================
    // STEP 5: Calculate averaged statistics for each direction
    // ========================================================================
    for (let i = 0; i < 2; i++) {
      const queueName = i === 0 ? 'Queue A' : 'Queue B';

      // Average queue length percentages
      // Example: If queue length 3 had 15% + 18% + 20% across 3 replications, average is 17.67%
      const avgLengthPercentages = {};
      for (const [length, totalPercent] of Object.entries(aggregateQueueTime[i])) {
        avgLengthPercentages[length] = safeAverage(totalPercent, numSeeds);
      }

      // Average hourly maximum percentages
      const avgMaxPercentages = {};
      for (const [length, totalPercent] of Object.entries(aggregateMaxCounts[i])) {
        avgMaxPercentages[length] = safeAverage(totalPercent, numSeeds);
      }

      // Add averaged queue statistics
      avgResults.queues.push({
        name: queueName,
        lengthPercentages: avgLengthPercentages,
        maxPercentages: avgMaxPercentages
      });

      // Add averaged arrival rate statistics
      avgResults.arrivalRates.push({
        name: queueName,
        sameQueue: safeAverage(aggregateArrivalRates[i].same, numSeeds),
        oppositeQueue: safeAverage(aggregateArrivalRates[i].opposite, numSeeds),
        noqueue: safeAverage(aggregateArrivalRates[i].noqueue, numSeeds),
        totalPerHour: safeAverage(aggregateArrivalRates[i].total, numSeeds)
      });

      // Add averaged delay statistics
      avgResults.delays.push({
        name: queueName,
        avgDelayAll: safeAverage(aggregateDelays[i].delayAll, numSeeds),
        avgDelayQueued: safeAverage(aggregateDelays[i].delayQueued, numSeeds),
        totalVehicles: safeAverage(aggregateDelays[i].totalVehicles, numSeeds),
        queuedVehicles: safeAverage(aggregateDelays[i].queuedVehicles, numSeeds),
        conflictPercentage: safeAverage(aggregateDelays[i].conflicts, numSeeds)
      });
    }

    // ========================================================================
    // STEP 6: Return averaged results
    // ========================================================================
    return avgResults;
  }