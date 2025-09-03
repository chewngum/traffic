import numpy as np

# Simulation parameters
road_length_m = 30
road_speed_kmh = 20
arrival_rate_per_hr = 15
sim_hours = 1000
n_seeds = 10
dt = 0.1  # time step in seconds

# Derived parameters
road_speed_m_s = road_speed_kmh * 1000 / 3600
service_time_s = road_length_m / road_speed_m_s
arrival_rate_per_s = arrival_rate_per_hr / 3600

def simulate_discrete(seed):
    np.random.seed(seed)
    total_steps = int(sim_hours * 3600 / dt)
    
    # Queue and vehicles on road: each vehicle stores remaining travel time
    on_road = []
    queue = []
    
    # Statistics
    queue_lengths_time = {}
    max_queue_per_hour = [0] * sim_hours
    
    for step in range(total_steps):
        t = step * dt
        current_hour = int(t // 3600)
        
        # Handle arrivals (Poisson arrivals for dt)
        p_arrival = arrival_rate_per_s * dt
        arrivals = np.random.poisson(p_arrival)
        for _ in range(arrivals):
            if len(on_road) == 0 and len(queue) == 0:
                on_road.append(service_time_s)  # vehicle enters immediately
            else:
                queue.append(service_time_s)
        
        # Update vehicles on road
        new_on_road = []
        for remaining_time in on_road:
            remaining_time -= dt
            if remaining_time > 0:
                new_on_road.append(remaining_time)
        on_road = new_on_road
        
        # Move vehicles from queue to road if space available
        if len(on_road) == 0 and len(queue) > 0:
            next_vehicle_time = queue.pop(0)
            on_road.append(next_vehicle_time)
        
        # Current queue length: vehicles waiting + vehicles on road
        current_queue_length = len(queue) + len(on_road)
        
        # Update time-weighted stats
        queue_lengths_time[current_queue_length] = queue_lengths_time.get(current_queue_length, 0) + dt
        if current_hour < sim_hours:
            max_queue_per_hour[current_hour] = max(max_queue_per_hour[current_hour], current_queue_length)
    
    # Convert time spent to percentage
    total_time = sum(queue_lengths_time.values())
    percent_time_each_length = {k: round(v / total_time * 100, 2) for k, v in queue_lengths_time.items()}
    
    # Convert max queue per hour to percentage
    unique_max_queues = set(max_queue_per_hour)
    percent_hours_max_queue = {q: round(max_queue_per_hour.count(q) / sim_hours * 100, 2) for q in unique_max_queues}
    
    return percent_time_each_length, percent_hours_max_queue

# Run simulations
results_time_list = []
results_hour_list = []

for seed in range(n_seeds):
    t_dict, h_dict = simulate_discrete(seed)
    results_time_list.append(t_dict)
    results_hour_list.append(h_dict)

# Aggregate results
all_lengths = set()
for r in results_time_list:
    all_lengths.update(r.keys())
all_lengths = sorted(all_lengths)
percent_time_avg = {}
for length in all_lengths:
    percent_time_avg[length] = round(np.mean([r.get(length, 0) for r in results_time_list]), 2)

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
