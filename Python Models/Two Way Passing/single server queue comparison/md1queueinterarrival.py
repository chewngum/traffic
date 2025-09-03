import numpy as np

# Simulation parameters
road_length_m = 30           # road section length in meters
road_speed_kmh = 20          # speed in km/h
arrival_rate_per_hr = 30     # vehicles per hour
sim_hours = 1000            # total simulation time in hours
n_seeds = 100              # number of random seeds to average over

# Derived parameters
road_speed_m_s = road_speed_kmh * 1000 / 3600  # km/h to m/s
service_time_s = road_length_m / road_speed_m_s
arrival_rate_per_s = arrival_rate_per_hr / 3600

def simulate(seed):
    np.random.seed(seed)
    t = 0.0
    queue = []
    next_arrival = np.random.exponential(1 / arrival_rate_per_s)
    next_departure = np.inf

    # Time-weighted queue length and per-hour max queue
    queue_lengths_time = {}
    max_queue_per_hour = [0] * sim_hours

    while t < sim_hours * 3600:
        # Determine next event
        if next_arrival <= next_departure:
            t_next = next_arrival
            event_type = "arrival"
        else:
            t_next = next_departure
            event_type = "departure"

        # Current queue length (vehicles on road + waiting)
        current_queue_length = len(queue) + (1 if next_departure != np.inf and t < next_departure else 0)
        duration = t_next - t
        if duration > 0:
            queue_lengths_time[current_queue_length] = queue_lengths_time.get(current_queue_length, 0) + duration

        # Update max queue per hour
        current_hour = int(t // 3600)
        if current_hour < sim_hours:
            max_queue_per_hour[current_hour] = max(max_queue_per_hour[current_hour], current_queue_length)

        t = t_next

        # Process event
        if event_type == "arrival":
            if len(queue) == 0 and next_departure == np.inf:
                next_departure = t + service_time_s
            else:
                queue.append(t)
            next_arrival = t + np.random.exponential(1 / arrival_rate_per_s)
        else:  # departure
            if len(queue) > 0:
                queue.pop(0)
                next_departure = t + service_time_s
            else:
                next_departure = np.inf

    # Convert time spent to percentage
    total_time = sum(queue_lengths_time.values())
    percent_time_each_length = {k: round(v / total_time * 100, 2) for k, v in queue_lengths_time.items()}

    # Convert max queue per hour to percentage of hours
    unique_max_queues = set(max_queue_per_hour)
    percent_hours_max_queue = {q: round(max_queue_per_hour.count(q) / sim_hours * 100, 2) for q in unique_max_queues}

    return percent_time_each_length, percent_hours_max_queue

# Run simulations and average results
results_time_list = []
results_hour_list = []

for seed in range(n_seeds):
    t_dict, h_dict = simulate(seed)
    results_time_list.append(t_dict)
    results_hour_list.append(h_dict)

# Aggregate results for time percentages
all_lengths = set()
for r in results_time_list:
    all_lengths.update(r.keys())
all_lengths = sorted(all_lengths)
percent_time_avg = {}
for length in all_lengths:
    percent_time_avg[length] = round(np.mean([r.get(length, 0) for r in results_time_list]), 2)

# Aggregate results for max queue per hour
all_hour_max = set()
for r in results_hour_list:
    all_hour_max.update(r.keys())
all_hour_max = sorted(all_hour_max)
percent_hours_avg = {}
for q in all_hour_max:
    percent_hours_avg[q] = round(np.mean([r.get(q, 0) for r in results_hour_list]), 2)

# Print results
print("Percentage of time with each queue length:")
for length in all_lengths:
    print(f"Queue length {length}: {percent_time_avg[length]}%")

print("\nPercentage of hours with each maximum queue length:")
for q in all_hour_max:
    print(f"Max queue {q}: {percent_hours_avg[q]}%")
