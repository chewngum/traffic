import random
import math
import numpy as np

# --- Parameters ---
ROAD_LENGTH = 30.0  # meters
CAR_SPEED = 20 * 1000 / 3600  # 20 km/h in m/s
TIME_STEP = 0.2  # seconds
SIM_HOURS = 1000  # number of hours to simulate
CARS_PER_HOUR = 15  # per direction
ARRIVAL_RATE = CARS_PER_HOUR / 3600  # cars per second
DIRECTIONS = ['A', 'B']

# --- Generate interarrival times based on Poisson process ---
def generate_arrival_times(rate_per_sec, duration_sec):
    times = []
    t = 0.0
    while t < duration_sec:
        dt = random.expovariate(rate_per_sec)
        t += dt
        if t < duration_sec:
            times.append(t)
    return times

# --- Car agent ---
class Car:
    def __init__(self, direction, arrival_time):
        self.direction = direction
        self.arrival_time = arrival_time
        self.enter_time = None
        self.exit_time = None
        self.position = 0.0  # meters

    def update_position(self, dt):
        self.position += CAR_SPEED * dt

# --- Main simulation loop ---
def simulate_hour(seed=None):
    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)

    duration = 3600.0  # seconds in 1 hour
    arrival_times = {d: generate_arrival_times(ARRIVAL_RATE, duration) for d in DIRECTIONS}
    queues = {d: [] for d in DIRECTIONS}
    on_road = []

    time = 0.0
    step_count = int(duration / TIME_STEP)
    conflict_occurred = False

    for step in range(step_count):
        time = step * TIME_STEP

        # Add new arrivals to queue
        for d in DIRECTIONS:
            while arrival_times[d] and arrival_times[d][0] <= time:
                queues[d].append(Car(d, arrival_times[d].pop(0)))

        # Remove cars that exited the road
        on_road = [car for car in on_road if car.position < ROAD_LENGTH]

        # Determine who is currently on the road
        active_dirs = set(car.direction for car in on_road)

        for d in DIRECTIONS:
            opp = 'B' if d == 'A' else 'A'
            if queues[d] and not on_road:
                # Road is empty: allow next car to enter
                car = queues[d].pop(0)
                car.enter_time = time
                car.position = 0.0
                on_road.append(car)
            elif queues[d] and active_dirs == {d}:
                # Same direction on road, allow more cars if needed
                pass  # Optional: allow trailing cars
            elif queues[d] and opp in active_dirs:
                # Conflict detected
                conflict_occurred = True

        # Update positions of cars on the road
        for car in on_road:
            car.update_position(TIME_STEP)

    return conflict_occurred

# --- Run simulation across many hours ---
def run_simulation(num_hours=10000):
    conflict_hours = 0
    for hour in range(num_hours):
        if simulate_hour(seed=hour):
            conflict_hours += 1
    percentage = 100 * conflict_hours / num_hours
    print(f"Percentage of hours with a directional conflict: {percentage:.2f}%")

# Do not run automatically
run_simulation()
