import numpy as np
from collections import deque

# Simulation parameters
road_length = 30  # meters
car_speed_kmh = 20  # km/h
car_speed_mps = car_speed_kmh * 1000 / 3600  # convert to m/s
car_travel_time = road_length / car_speed_mps  # time to cross the road in seconds

arrival_rate_per_hour = 15
arrival_rate_per_sec = arrival_rate_per_hour / 3600  # per second
simulation_hours = 1000
sim_duration = simulation_hours * 3600  # total simulation time in seconds
time_step = 0.1  # seconds
num_steps = int(sim_duration / time_step)

# Function to generate Poisson arrival times
def generate_arrival_times(rate_per_sec, duration_sec):
    arrivals = []
    t = 0
    while t < duration_sec:
        inter_arrival = np.random.exponential(1 / rate_per_sec)
        t += inter_arrival
        if t < duration_sec:
            arrivals.append(t)
    return np.array(arrivals)

# Set random seed for reproducibility
np.random.seed(42)

# Generate arrival times
arrival_times_A = generate_arrival_times(arrival_rate_per_sec, sim_duration)
arrival_times_B = generate_arrival_times(arrival_rate_per_sec, sim_duration)

# Convert to queues
queue_A = deque(arrival_times_A)
queue_B = deque(arrival_times_B)

# Cars currently on road (end times of their travel)
on_road_A = []
on_road_B = []

# Track hours where passing occurred
pass_hours = set()

# Simulation loop
for step in range(num_steps):
    current_time = step * time_step
    hour = int(current_time // 3600)

    # Remove cars that have left the road
    on_road_A = [end_time for end_time in on_road_A if end_time > current_time]
    on_road_B = [end_time for end_time in on_road_B if end_time > current_time]

    # Add new cars entering the road
    while queue_A and queue_A[0] <= current_time:
        queue_A.popleft()
        on_road_A.append(current_time + car_travel_time)

    while queue_B and queue_B[0] <= current_time:
        queue_B.popleft()
        on_road_B.append(current_time + car_travel_time)

    # Check for passing
    if on_road_A and on_road_B:
        pass_hours.add(hour)

# Final result
print(f"Cars passed each other in {len(pass_hours)} out of {simulation_hours} hours.")
