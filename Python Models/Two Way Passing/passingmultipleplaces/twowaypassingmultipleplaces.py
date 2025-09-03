import random
import math
from collections import deque, defaultdict

# --- Configurable parameters ---

TOTAL_LENGTH = 30.0  # total road length in meters
SECTION_LENGTH = 30.0  # one-way section length before each bay
BAY_LENGTH = 6.0  # length of each passing bay

SPEED = 20 / 3.6  # car speed in m/s (constant)

ARRIVAL_RATE_A = 15  # cars per hour from direction A  
ARRIVAL_RATE_B = 15  # cars per hour from direction B

MIN_HEADWAY = 0  # minimum seconds gap between arrivals from same direction

SIM_HOURS = 1000  # simulation length in hours
TIME_STEP = 0.1  # time step in seconds
TOTAL_TIME = SIM_HOURS * 3600  # total simulation time in seconds

# --- Derived constants ---

NUM_BAYS = int(math.floor(TOTAL_LENGTH / (SECTION_LENGTH + BAY_LENGTH)))

# Handle case when no bays exist (pure M/M/1 system)
if NUM_BAYS == 0:
    MAX_CARS_ON_ROAD = float('inf')  # No capacity limit for M/M/1
else:
    MAX_CARS_ON_ROAD = NUM_BAYS + 1

# Positions of bays (start and end, in discrete 0.1 m units)
# Each bay is after a one-way section
# Positions stored as integer multiples of 0.1m (e.g. 30.0m -> 300)
BAY_POSITIONS = []
pos = int(SECTION_LENGTH * 10)
for i in range(NUM_BAYS):
    start = pos + i * int((SECTION_LENGTH + BAY_LENGTH) * 10)
    end = start + int(BAY_LENGTH * 10)
    BAY_POSITIONS.append( (start, end) )

# Road length in 0.1m units
ROAD_LENGTH_UNITS = int(TOTAL_LENGTH * 10)

# --- Helper functions ---

def poisson_arrivals(rate_per_hour, min_headway_sec, total_time_sec):
    """Generate arrival times with Poisson process plus minimum headway."""
    arrivals = []
    current_time = 0.0
    rate_per_sec = rate_per_hour / 3600.0
    while current_time < total_time_sec:
        interval = random.expovariate(rate_per_sec)
        # enforce minimum headway
        interval = max(interval, min_headway_sec)
        current_time += interval
        if current_time < total_time_sec:
            arrivals.append(current_time)
    return arrivals

def is_conflict(car1, car2):
    """Determine if two cars conflict (opposite directions and paths overlap)."""
    # Check if cars are going opposite directions
    if car1.direction == car2.direction:
        return False
    # If positions overlap or cross on one-way segment, conflict
    # Here we check if their positions are within same one-way section or bay
    # Using discrete positions, conflict if cars between same bay indexes and 
    # moving toward each other
    
    # Find next bay index for each car (the bay they approach or currently in)
    bay_index_1 = car1.next_bay_index()
    bay_index_2 = car2.next_bay_index()
    
    # If cars are not on same segment or adjacent segments, no conflict
    # A segment is between bays: segment i is from bay i-1 end to bay i start
    # For simplicity: conflict if cars on same segment or adjacent bay
    
    # Also check if their positions overlap (within 0.1m)
    pos_diff = abs(car1.position - car2.position)
    if pos_diff < 1:  # within 0.1m * 10 = 1m range
        return True

    # If both cars are between the same two bays and heading towards each other -> conflict
    # More sophisticated checks could be implemented here if needed

    # For simplicity, if their positions overlap or are within one-way section approaching bay, we consider conflict
    return False

def bay_index_for_position(pos):
    """Return bay index that covers the given position or None."""
    for i, (start, end) in enumerate(BAY_POSITIONS):
        if start <= pos <= end:
            return i
    return None

# --- Agent class ---

class Car:
    _id_counter = 0
    def __init__(self, direction, arrival_time):
        self.id = Car._id_counter
        Car._id_counter += 1
        
        self.direction = direction  # 'A' or 'B'
        self.arrival_time = arrival_time  # time car arrives at entry queue
        self.position = None  # position in 0.1m units; None if waiting to enter
        self.status = 'waiting_entry'  # 'waiting_entry', 'driving', 'waiting_bay', 'exited'
        self.wait_start_time = arrival_time
        self.total_wait_time = 0.0
        
        # For conflict handling
        self.waiting_bay_index = None
        
        # Set initial position at entry point depending on direction
        self.entry_pos = 0 if direction == 'A' else ROAD_LENGTH_UNITS
        # Position when on road
        self.position = None  # set on entering road
        
    def enter_road(self):
        self.status = 'driving'
        self.position = self.entry_pos
        
    def next_bay_index(self):
        """Return the index of the bay that this car is heading to next."""
        if self.position is None:
            return None
        if self.direction == 'A':
            # Find next bay with position greater than current position
            for i, (start, _) in enumerate(BAY_POSITIONS):
                if self.position < start:
                    return i
            return None  # no more bays ahead
        else:
            # Direction B goes from ROAD_LENGTH_UNITS to 0
            # Find next bay with end position less than current position
            for i in reversed(range(len(BAY_POSITIONS))):
                _, end = BAY_POSITIONS[i]
                if self.position > end:
                    return i
            return None
        
    def move(self):
        if self.status == 'driving':
            step = int(SPEED * 10 * TIME_STEP)  # convert m/s to 0.1m units per step
            if self.direction == 'A':
                self.position = min(self.position + step, ROAD_LENGTH_UNITS)
            else:
                self.position = max(self.position - step, 0)
        # if waiting, position does not change
        
    def in_bay(self):
        """Returns True if currently positioned inside a bay."""
        return bay_index_for_position(self.position) is not None
    
    def at_road_end(self):
        if self.direction == 'A':
            return self.position >= ROAD_LENGTH_UNITS
        else:
            return self.position <= 0

# --- Simulation state ---

cars_waiting_A = deque()
cars_waiting_B = deque()
cars_on_road = []

queue_lengths_A = []
queue_lengths_B = []

waiting_times = []

max_queue_A_per_hour = defaultdict(int)
max_queue_B_per_hour = defaultdict(int)

queue_time_per_hour_A = defaultdict(float)  # seconds queued per hour
queue_time_per_hour_B = defaultdict(float)

# --- Generate arrivals ---

arrivals_A = poisson_arrivals(ARRIVAL_RATE_A, MIN_HEADWAY, TOTAL_TIME)
arrivals_B = poisson_arrivals(ARRIVAL_RATE_B, MIN_HEADWAY, TOTAL_TIME)

# Arrival indices
idx_arrival_A = 0
idx_arrival_B = 0

# Simulation loop

time = 0.0

def current_hour(t):
    return int(t // 3600)

print(f"Simulation start: Road length = {TOTAL_LENGTH}m, bays = {NUM_BAYS}, max cars = {MAX_CARS_ON_ROAD if MAX_CARS_ON_ROAD != float('inf') else 'unlimited (M/M/1)'}")

while time < TOTAL_TIME or cars_on_road or cars_waiting_A or cars_waiting_B:

    # Add arriving cars to waiting queues
    while idx_arrival_A < len(arrivals_A) and arrivals_A[idx_arrival_A] <= time:
        cars_waiting_A.append(Car('A', arrivals_A[idx_arrival_A]))
        idx_arrival_A += 1
    while idx_arrival_B < len(arrivals_B) and arrivals_B[idx_arrival_B] <= time:
        cars_waiting_B.append(Car('B', arrivals_B[idx_arrival_B]))
        idx_arrival_B += 1

    # Attempt to move waiting cars onto road if capacity permits
    while len(cars_on_road) < MAX_CARS_ON_ROAD:
        # Prioritize cars by arrival time across both queues
        candidates = []
        if cars_waiting_A:
            candidates.append(cars_waiting_A[0])
        if cars_waiting_B:
            candidates.append(cars_waiting_B[0])
        if not candidates:
            break
        next_car = min(candidates, key=lambda c: c.arrival_time)

        # Enter road
        if next_car.direction == 'A':
            car = cars_waiting_A.popleft()
        else:
            car = cars_waiting_B.popleft()
        car.enter_road()
        car.total_wait_time += time - car.wait_start_time
        waiting_times.append(car.total_wait_time)
        cars_on_road.append(car)

    # Movement and conflict handling

    # First, move cars not waiting in bays
    for car in cars_on_road:
        if car.status == 'driving':
            car.move()

    # Only do conflict detection if we have bays AND bidirectional traffic
    if NUM_BAYS > 0 and ARRIVAL_RATE_A > 0 and ARRIVAL_RATE_B > 0:
        # Detect conflicts and handle waiting
        # For every pair of cars with opposite directions, check for conflict
        # If conflict, determine who arrives at next bay first to yield

        # Get cars by direction
        cars_A = [c for c in cars_on_road if c.direction == 'A' and c.status == 'driving']
        cars_B = [c for c in cars_on_road if c.direction == 'B' and c.status == 'driving']

        # Track bays occupied this step
        bays_occupied = set([c.waiting_bay_index for c in cars_on_road if c.status == 'waiting_bay'])

        # Check pairwise conflicts (naive O(n^2), ok for small N)
        for carA in cars_A:
            for carB in cars_B:
                # Simple conflict detection: if positions are within 15m (150 units) on road
                # and carA is behind carB if facing each other (simplify here)
                if abs(carA.position - carB.position) < 150:
                    # Determine who reaches next bay first
                    bayA = carA.next_bay_index()
                    bayB = carB.next_bay_index()

                    # For tie or unknown bay index, arbitrarily pick carA to yield
                    if bayA is None and bayB is None:
                        yield_car = carA
                    elif bayA is None:
                        yield_car = carA
                    elif bayB is None:
                        yield_car = carB
                    else:
                        # Calculate distance to bay for each car
                        if carA.direction == 'A':
                            distA = (BAY_POSITIONS[bayA][0] - carA.position) if bayA is not None else 0
                        else:
                            distA = (carA.position - BAY_POSITIONS[bayA][1]) if bayA is not None else 0
                        if carB.direction == 'A':
                            distB = (BAY_POSITIONS[bayB][0] - carB.position) if bayB is not None else 0
                        else:
                            distB = (carB.position - BAY_POSITIONS[bayB][1]) if bayB is not None else 0
                        if distA < distB:
                            yield_car = carA
                        else:
                            yield_car = carB

                    # Yield car moves into bay if bay free, else waits at current position
                    bay_idx = yield_car.next_bay_index()
                    if bay_idx is not None and bay_idx not in bays_occupied:
                        yield_car.status = 'waiting_bay'
                        yield_car.waiting_bay_index = bay_idx
                        # Move car to start of bay
                        bay_start, _ = BAY_POSITIONS[bay_idx]
                        yield_car.position = bay_start + 1  # slight offset inside bay
                        bays_occupied.add(bay_idx)
                        yield_car.wait_start_time = time
                    else:
                        # Bay occupied, car must wait in place, count as waiting
                        yield_car.status = 'waiting_bay'
                        yield_car.waiting_bay_index = None
                        yield_car.wait_start_time = time

        # Handle cars waiting in bays: check if conflict cleared
        for car in cars_on_road:
            if car.status == 'waiting_bay':
                # Check if any conflicting car is still blocking
                conflict = False
                for other in cars_on_road:
                    if other == car or other.status == 'waiting_bay':
                        continue
                    if other.direction != car.direction:
                        # Check if their positions overlap in the one-way section before bay
                        # Simplified: if other car is between yield_car and bay, still conflict
                        if car.direction == 'A':
                            if other.position > car.position:
                                conflict = True
                                break
                        else:
                            if other.position < car.position:
                                conflict = True
                                break
                if not conflict:
                    # No conflict, resume driving
                    car.status = 'driving'
                    car.waiting_bay_index = None
                    # Update wait time
                    car.total_wait_time += time - car.wait_start_time

    # Remove cars that have reached road end
    cars_exited = [c for c in cars_on_road if c.at_road_end()]
    for c in cars_exited:
        cars_on_road.remove(c)

    # Record queue lengths
    hr = current_hour(time)
    
    # For M/M/1 system (no bays), queue length includes cars waiting + cars on road
    # For passing bay system, only count cars waiting to enter
    if NUM_BAYS == 0:
        # M/M/1: total system size = waiting + being served
        queue_len_A = len(cars_waiting_A) + len([c for c in cars_on_road if c.direction == 'A'])
        queue_len_B = len(cars_waiting_B) + len([c for c in cars_on_road if c.direction == 'B'])
    else:
        # Original logic: only count cars waiting to enter
        queue_len_A = len(cars_waiting_A)
        queue_len_B = len(cars_waiting_B)
    
    queue_lengths_A.append(queue_len_A)
    queue_lengths_B.append(queue_len_B)

    max_queue_A_per_hour[hr] = max(max_queue_A_per_hour[hr], queue_len_A)
    max_queue_B_per_hour[hr] = max(max_queue_B_per_hour[hr], queue_len_B)

    if len(cars_waiting_A) > 0:
        queue_time_per_hour_A[hr] += TIME_STEP
    if len(cars_waiting_B) > 0:
        queue_time_per_hour_B[hr] += TIME_STEP

    time += TIME_STEP

# --- Post-simulation analysis ---

total_hours = SIM_HOURS
freq_A = defaultdict(int)
freq_B = defaultdict(int)

for qlen in max_queue_A_per_hour.values():
    freq_A[qlen] += 1
for qlen in max_queue_B_per_hour.values():
    freq_B[qlen] += 1

def freq_to_percent(freq_dict):
    total = sum(freq_dict.values())
    out = {}
    for k,v in sorted(freq_dict.items()):
        out[k] = (v / total) * 100
    return out

freq_pct_A = freq_to_percent(freq_A)
freq_pct_B = freq_to_percent(freq_B)

# Compute cumulative percentages
def cumulative(freq_pct):
    cum = 0
    cum_dict = {}
    for k,v in freq_pct.items():
        cum += v
        cum_dict[k] = cum
    return cum_dict

cum_pct_A = cumulative(freq_pct_A)
cum_pct_B = cumulative(freq_pct_B)

print(f"\n--- Simulation Results ---")
print(f"Total cars processed: {Car._id_counter}")
print(f"Road length: {TOTAL_LENGTH} m, Bays: {NUM_BAYS}")
print(f"Max cars on road at once: {MAX_CARS_ON_ROAD}")
print(f"Simulation time: {SIM_HOURS} hours\n")

avg_wait = sum(waiting_times)/len(waiting_times) if waiting_times else 0
print(f"Average total wait time per car: {avg_wait:.2f} s")

pct_hours_with_queue_A = (sum(1 for q in max_queue_A_per_hour.values() if q>0) / total_hours)*100
pct_hours_with_queue_B = (sum(1 for q in max_queue_B_per_hour.values() if q>0) / total_hours)*100

print(f"Percentage of hours with queue (A): {pct_hours_with_queue_A:.1f}%")
print(f"Percentage of hours with queue (B): {pct_hours_with_queue_B:.1f}%\n")

print(f"Max queue length frequency (per hour):")
print(f"{'Q':>2}  {'A (%)':>8}  {'A Cum (%)':>10}   {'B (%)':>8}  {'B Cum (%)':>10}")
for q in sorted(set(freq_pct_A.keys()) | set(freq_pct_B.keys())):
    a_pct = freq_pct_A.get(q, 0)
    b_pct = freq_pct_B.get(q, 0)
    a_cum = cum_pct_A.get(q, 0)
    b_cum = cum_pct_B.get(q, 0)
    print(f"{q:2} {a_pct:8.1f} {a_cum:10.1f}   {b_pct:8.1f} {b_cum:10.1f}")