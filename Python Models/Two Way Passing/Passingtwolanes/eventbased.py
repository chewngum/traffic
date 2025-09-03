import numpy as np

# Parameters
road_length = 30  # meters
car_speed_kmh = 20  # km/h
car_speed_mps = car_speed_kmh * 1000 / 3600  # m/s
car_travel_time = road_length / car_speed_mps  # seconds to cross the road

arrival_rate_per_hour = 15
arrival_rate_per_sec = arrival_rate_per_hour / 3600  # per second
simulation_hours = 1000
sim_duration = simulation_hours * 3600  # seconds

# Generate arrival times using exponential interarrival times
def generate_arrivals(rate_per_sec, duration_sec):
    arrivals = []
    t = 0
    while t < duration_sec:
        inter_arrival = np.random.exponential(1 / rate_per_sec)
        t += inter_arrival
        if t < duration_sec:
            arrivals.append(t)
    return np.array(arrivals)

# Run the simulation for a given seed
def simulate(seed):
    np.random.seed(seed)
    arrivals_A = generate_arrivals(arrival_rate_per_sec, sim_duration)
    arrivals_B = generate_arrivals(arrival_rate_per_sec, sim_duration)

    i, j = 0, 0
    pass_hours = set()

    while i < len(arrivals_A) and j < len(arrivals_B):
        t_A = arrivals_A[i]
        t_B = arrivals_B[j]

        if abs(t_A - t_B) <= car_travel_time:
            hour = int(min(t_A, t_B) // 3600)
            pass_hours.add(hour)
            i += 1
            j += 1
        elif t_A < t_B:
            i += 1
        else:
            j += 1

    return len(pass_hours)

# Run across 100 seeds and collect results
all_pass_counts = []

for seed in range(1000):
    passes = simulate(seed)
    all_pass_counts.append(passes)

# Compute and print average
average_passes = sum(all_pass_counts) / len(all_pass_counts)
print(f"\nAverage hours with passes over 1000 seeds: {average_passes:.2f}")
