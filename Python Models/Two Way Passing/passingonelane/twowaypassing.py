import heapq
import random
from collections import defaultdict

# --- Parameters ---
arrival_rates_per_hour = [15, 15]  # Queue A, Queue B
service_time = 5.4
simulation_time = 1000 * 3600  # 1000 hours
min_gap = 0  # seconds
num_seeds = 100

# --- Adjust arrival rates to preserve expected arrivals ---
arrival_rates = []
for r in arrival_rates_per_hour:
    lambda_orig = r / 3600
    if min_gap >= 1 / lambda_orig:
        raise ValueError("min_gap too large relative to arrival rate!")
    lambda_new = 1 / (1 / lambda_orig - min_gap)
    arrival_rates.append(lambda_new)

# --- Classes ---
class Queue:
    def __init__(self, name, num_hours):
        self.name = name
        self.length = 0
        self.arrival_times = []  # track individual arrival times for global FCFS
        self.time_weighted_lengths = defaultdict(float)
        self.hourly_max = [0]*num_hours
        self.arrivals_same = 0
        self.arrivals_opposite = 0

    def reset(self):
        self.length = 0
        self.arrival_times = []
        self.time_weighted_lengths = defaultdict(float)
        self.hourly_max = [0]*len(self.hourly_max)
        self.arrivals_same = 0
        self.arrivals_opposite = 0

class Server:
    def __init__(self):
        self.busy = False
        self.current_queue = None
        self.busy_time = 0

    def reset(self):
        self.busy = False
        self.current_queue = None
        self.busy_time = 0

class Event:
    def __init__(self, time, event_type, queue_idx):
        self.time = time
        self.type = event_type
        self.queue_idx = queue_idx
    def __lt__(self, other):
        return self.time < other.time

# --- Helper functions ---
def record_time(current_time, queues, server, last_time):
    dt = current_time - last_time
    for q in queues:
        q.time_weighted_lengths[q.length] += dt
        hour_idx = int(current_time // 3600)
        if hour_idx >= len(q.hourly_max):
            hour_idx = len(q.hourly_max) - 1
        q.hourly_max[hour_idx] = max(q.hourly_max[hour_idx], q.length)
    if server.busy:
        server.busy_time += dt
    return current_time

def select_next_queue(queues):
    # pick queue with earliest arrival globally
    earliest_time = float('inf')
    next_idx = None
    for i, q in enumerate(queues):
        if q.length > 0 and q.arrival_times[0] < earliest_time:
            earliest_time = q.arrival_times[0]
            next_idx = i
    return next_idx

# --- Deterministic seeds ---
seeds = list(range(1, num_seeds + 1))

# --- Initialize queues and server ---
num_hours = int(simulation_time // 3600)
queues = [Queue("Queue A", num_hours), Queue("Queue B", num_hours)]
server = Server()

# --- Accumulators ---
avg_time_weighted = [defaultdict(float), defaultdict(float)]
avg_server_util = 0
avg_arrivals_same = [0, 0]
avg_arrivals_opposite = [0, 0]
hourly_max_counts_total = [defaultdict(int), defaultdict(int)]
avg_departures = 0

# --- Simulation loop over seeds ---
for seed in seeds:
    random.seed(seed)
    last_event_time = 0
    server.reset()
    for q in queues:
        q.reset()
    events = []
    departures_count = 0

    for i, rate in enumerate(arrival_rates):
        first_arrival = min_gap + random.expovariate(rate)
        heapq.heappush(events, Event(first_arrival, 'arrival', i))

    while events:
        event = heapq.heappop(events)
        if event.time > simulation_time:
            break
        last_event_time = record_time(event.time, queues, server, last_event_time)
        q = queues[event.queue_idx]

        if event.type == 'arrival':
            q.length += 1
            q.arrival_times.append(event.time)

            if server.busy:
                if server.current_queue == event.queue_idx:
                    q.arrivals_same += 1
                else:
                    q.arrivals_opposite += 1

            # Schedule next arrival with min_gap and adjusted rate
            dt = random.expovariate(arrival_rates[event.queue_idx])
            next_arrival = event.time + min_gap + dt
            heapq.heappush(events, Event(next_arrival, 'arrival', event.queue_idx))

            # Start service if server idle
            if not server.busy:
                next_idx = select_next_queue(queues)
                if next_idx is not None:
                    server.busy = True
                    server.current_queue = next_idx
                    queues[next_idx].length -= 1
                    queues[next_idx].arrival_times.pop(0)
                    heapq.heappush(events, Event(event.time + service_time, 'departure', next_idx))

        elif event.type == 'departure':
            departures_count += 1
            next_idx = select_next_queue(queues)
            if next_idx is None:
                server.busy = False
                server.current_queue = None
            else:
                server.current_queue = next_idx
                queues[next_idx].length -= 1
                queues[next_idx].arrival_times.pop(0)
                heapq.heappush(events, Event(event.time + service_time, 'departure', next_idx))

    # --- Accumulate metrics ---
    for i, q in enumerate(queues):
        for length, t in q.time_weighted_lengths.items():
            avg_time_weighted[i][length] += t
        avg_arrivals_same[i] += q.arrivals_same
        avg_arrivals_opposite[i] += q.arrivals_opposite
        for hour_max in q.hourly_max:
            hourly_max_counts_total[i][hour_max] += 1
    avg_server_util += server.busy_time
    avg_departures += departures_count

# --- Average metrics ---
for i in range(2):
    for length in avg_time_weighted[i]:
        avg_time_weighted[i][length] /= num_seeds
    avg_arrivals_same[i] /= num_seeds
    avg_arrivals_opposite[i] /= num_seeds
avg_server_util /= num_seeds

# --- Reporting ---
for i, q_name in enumerate(["Queue A", "Queue B"]):
    total_time = sum(avg_time_weighted[i].values())
    print(f"\n{q_name} average time-weighted queue length percentages:")
    for length in sorted(avg_time_weighted[i].keys()):
        pct = (avg_time_weighted[i][length] / total_time) * 100
        print(f"  Length {length}: {pct:.2f}%")

utilization = (avg_server_util / simulation_time) * 100
print(f"\nAverage server utilization: {utilization:.2f}%")

for i, q_name in enumerate(["Queue A", "Queue B"]):
    total_hours = num_hours * num_seeds
    print(f"\n{q_name} average max queue length per hour percentages:")
    for length in sorted(hourly_max_counts_total[i].keys()):
        pct = (hourly_max_counts_total[i][length] / total_hours) * 100
        print(f"  Max length {length}: {pct:.2f}%")

for i, q_name in enumerate(["Queue A", "Queue B"]):
    print(f"\n{q_name} average arrival rates per hour while server busy:")
    print(f"  Same queue being served: {avg_arrivals_same[i] / (simulation_time / 3600):.2f}")
    print(f"  Opposite queue being served: {avg_arrivals_opposite[i] / (simulation_time / 3600):.2f}")

# --- Average cars served on the road per hour ---
avg_cars_per_hour = avg_departures / (num_seeds * (simulation_time / 3600))
print(f"\nAverage cars served on the road per hour: {avg_cars_per_hour:.2f}")
