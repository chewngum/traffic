import heapq
import random
import math
from collections import Counter

# --- Simulation Parameters ---
SIMULATION_HOURS = 1000       # total hours to simulate
ARRIVAL_RATE_A = 15           # cars per hour from A
ARRIVAL_RATE_B = 15           # cars per hour from B
ROAD_LENGTH = 30              # meters
SPEED_KMH = 20                # km/h
MIN_HEADWAY = 0             # seconds, minimum inter-arrival time
NUM_SEEDS = 100

# --- Derived Parameters ---
SIMULATION_TIME = SIMULATION_HOURS * 3600  # seconds
SPEED_MPS = SPEED_KMH * 1000 / 3600        # convert km/h to m/s
TRAVEL_TIME = ROAD_LENGTH / SPEED_MPS      # seconds to cross the road

# --- Conditional exponential inter-arrival ---
def conditional_exponential(rate_per_sec, min_headway):
    U = random.random()
    return min_headway - math.log(U) / rate_per_sec

# --- Simulation Function ---
def run_simulation(seed):
    random.seed(seed)

    road_busy = False
    current_car = None
    queue_A = []
    queue_B = []

    total_arrivals = 0
    num_queued = 0
    total_busy_time = 0.0
    last_event_time = 0.0
    conflict_count = 0

    # Hourly Max Queue Tracking
    current_hour = 0
    max_queue_A_hour = 0
    max_queue_B_hour = 0
    max_queue_A_list = []
    max_queue_B_list = []
    conflict_hour_flags = []

    # Time-weighted queue tracking
    queue_time_A = Counter()
    queue_time_B = Counter()
    last_queue_length_A = 0
    last_queue_length_B = 0

    event_queue = []

    # --- Car Class ---
    class Car:
        def __init__(self, arrival_time, direction):
            self.arrival_time = arrival_time
            self.direction = direction

    # --- Schedule First Arrivals ---
    def schedule_next_arrival(direction, current_time):
        rate = ARRIVAL_RATE_A / 3600 if direction == 'A' else ARRIVAL_RATE_B / 3600
        inter_arrival = conditional_exponential(rate, MIN_HEADWAY)
        arrival_time = current_time + inter_arrival
        if arrival_time <= SIMULATION_TIME:
            heapq.heappush(event_queue, (arrival_time, 'arrival', Car(arrival_time, direction)))

    schedule_next_arrival('A', 0)
    schedule_next_arrival('B', 0)

    # --- Simulation Loop ---
    while event_queue:
        event_time, event_type, car = heapq.heappop(event_queue)

        dt = event_time - last_event_time

        # --- Update time-weighted queue lengths ---
        queue_time_A[last_queue_length_A] += dt
        queue_time_B[last_queue_length_B] += dt
        last_queue_length_A = len(queue_A)
        last_queue_length_B = len(queue_B)

        # Update total busy time
        if road_busy:
            total_busy_time += dt
        last_event_time = event_time

        # --- Hourly Max Queue Tracking ---
        event_hour = int(event_time // 3600)
        while current_hour < event_hour:
            max_queue_A_list.append(max_queue_A_hour)
            max_queue_B_list.append(max_queue_B_hour)
            conflict_hour_flags.append(int(max_queue_A_hour > 0 or max_queue_B_hour > 0))
            max_queue_A_hour = len(queue_A)
            max_queue_B_hour = len(queue_B)
            current_hour += 1

        max_queue_A_hour = max(max_queue_A_hour, len(queue_A))
        max_queue_B_hour = max(max_queue_B_hour, len(queue_B))

        if event_type == 'arrival':
            total_arrivals += 1

            opposite_queue = queue_B if car.direction == 'A' else queue_A
            opposite_on_road = (current_car is not None and current_car.direction != car.direction)
            if len(opposite_queue) > 0 or opposite_on_road:
                conflict_count += 1

            # Single-lane logic: can only enter if road is free
            if not road_busy:
                road_busy = True
                current_car = car
                departure_time = event_time + TRAVEL_TIME
                heapq.heappush(event_queue, (departure_time, 'departure', car))
            else:
                num_queued += 1
                if car.direction == 'A':
                    queue_A.append(car)
                else:
                    queue_B.append(car)

            # Schedule next arrival
            schedule_next_arrival(car.direction, event_time)

        elif event_type == 'departure':
            road_busy = False
            current_car = None

            # Select next car from queues
            next_car = None
            if queue_A and queue_B:
                if queue_A[0].arrival_time <= queue_B[0].arrival_time:
                    next_car = queue_A.pop(0)
                else:
                    next_car = queue_B.pop(0)
            elif queue_A:
                next_car = queue_A.pop(0)
            elif queue_B:
                next_car = queue_B.pop(0)

            if next_car:
                road_busy = True
                current_car = next_car
                departure_time = event_time + TRAVEL_TIME
                heapq.heappush(event_queue, (departure_time, 'departure', next_car))

    # --- Capture last interval for time-weighted queue ---
    dt = SIMULATION_TIME - last_event_time
    queue_time_A[last_queue_length_A] += dt
    queue_time_B[last_queue_length_B] += dt

    # --- Compute results ---
    utilisation = (total_busy_time / SIMULATION_TIME) * 100
    wait_prob = (num_queued / total_arrivals) * 100
    wait_per_hour = num_queued / SIMULATION_HOURS
    conflicts_per_hour = conflict_count / SIMULATION_HOURS
    conflict_hour_prob = sum(conflict_hour_flags) / SIMULATION_HOURS * 100
    avg_conflict_interval = SIMULATION_HOURS / conflict_count if conflict_count > 0 else 0

    # Frequency of max queue lengths
    def compute_frequency(max_queue_list):
        counts = Counter(max_queue_list)
        total_hours = len(max_queue_list)
        freq_list = []
        cum = 0.0
        for q in sorted(counts.keys()):
            pct = counts[q] / total_hours * 100
            cum += pct
            freq_list.append((q, pct, cum))
            if cum >= 99.95:
                break
        return freq_list

    freq_A = compute_frequency(max_queue_A_list)
    freq_B = compute_frequency(max_queue_B_list)

    # Time-weighted queue percentages
    def time_weighted_percentage(counter):
        total_time = sum(counter.values())
        return [(q, t / total_time * 100) for q, t in sorted(counter.items())]

    tw_pct_A = time_weighted_percentage(queue_time_A)
    tw_pct_B = time_weighted_percentage(queue_time_B)

    return utilisation, wait_prob, wait_per_hour, conflicts_per_hour, conflict_hour_prob, avg_conflict_interval, freq_A, freq_B, tw_pct_A, tw_pct_B

# --- Aggregate over seeds ---
total_util, total_wait_prob, total_wait_hr = 0, 0, 0
total_conf_per_hr, total_conf_hr_prob, total_conf_gap = 0, 0, 0
all_freq_A = []
all_freq_B = []
all_tw_A = []
all_tw_B = []

for seed in range(NUM_SEEDS):
    util, wait_prob, wait_hr, conf_hr, conf_hr_prob, conf_gap, freq_A, freq_B, tw_A, tw_B = run_simulation(seed)
    total_util += util
    total_wait_prob += wait_prob
    total_wait_hr += wait_hr
    total_conf_per_hr += conf_hr
    total_conf_hr_prob += conf_hr_prob
    total_conf_gap += conf_gap
    all_freq_A.append(freq_A)
    all_freq_B.append(freq_B)
    all_tw_A.append(tw_A)
    all_tw_B.append(tw_B)

# --- Average outputs ---
avg_util = total_util / NUM_SEEDS
avg_wait_prob = total_wait_prob / NUM_SEEDS
avg_wait_hr = total_wait_hr / NUM_SEEDS
avg_conf_per_hr = total_conf_per_hr / NUM_SEEDS
avg_conf_hr_prob = total_conf_hr_prob / NUM_SEEDS
avg_conf_gap = total_conf_gap / NUM_SEEDS

# --- Average frequency table ---
def average_frequency(freq_lists):
    counter = Counter()
    total = len(freq_lists)
    for freq in freq_lists:
        for q, pct, _ in freq:
            counter[q] += pct
    avg_list = [(q, counter[q] / total) for q in sorted(counter.keys())]
    cum = 0
    avg_list_cum = []
    for q, pct in avg_list:
        cum += pct
        avg_list_cum.append((q, pct, cum))
        if cum >= 99.95:
            break
    return avg_list_cum

avg_freq_A = average_frequency(all_freq_A)
avg_freq_B = average_frequency(all_freq_B)

# --- Average time-weighted percentages ---
def average_tw(tw_lists):
    counter = Counter()
    total = len(tw_lists)
    for tw in tw_lists:
        for q, pct in tw:
            counter[q] += pct
    avg_list = [(q, counter[q] / total) for q in sorted(counter.keys())]
    return avg_list

avg_tw_A = average_tw(all_tw_A)
avg_tw_B = average_tw(all_tw_B)

# --- Output ---
print(f"=== Average Results Over {NUM_SEEDS} Seeds and {SIMULATION_HOURS} Hours Each ===")
print(f"Utilisation             : {avg_util:.2f}%")
print(f"Cars which queue        : {avg_wait_prob:.2f}%")
print(f"Queued Cars Per Hour    : {avg_wait_hr:.2f}")
print(f"Conflicts Per Hour      : {avg_conf_per_hr:.3f}")
print(f"Hours with conflicts    : {avg_conf_hr_prob:.2f}% of hours")
print(f"Gap between conflicts   : {avg_conf_gap:.2f} hours")

print("\n=== Average Frequency % of Hours by Max Queued Cars per Direction with Cumulative % ===")
print(" Q    A (%)  A Cum (%)      B (%)  B Cum (%)")
for (q, pctA, cumA), (_, pctB, cumB) in zip(avg_freq_A, avg_freq_B):
    print(f"{q:2d} {pctA:7.2f} {cumA:9.2f} {pctB:9.2f} {cumB:9.2f}")

print("\n=== Average Time-Weighted Queue Length Percentage per Direction ===")
print(" Q    A (%)      B (%)")
for (qA, pctA), (qB, pctB) in zip(avg_tw_A, avg_tw_B):
    print(f"{qA:2d} {pctA:8.2f} {pctB:8.2f}")
