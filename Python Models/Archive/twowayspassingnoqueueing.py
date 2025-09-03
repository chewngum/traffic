import random

ARRIVAL_RATE = 15 / 3600  # arrivals per second
SERVICE_TIME = 20 / 3.6   # seconds per car
SIMULATION_TIME = 3600000  # 100 hours in seconds
SEED = 42

random.seed(SEED)

def exponential(seed):
    return random.expovariate(seed)

# Generate arrival times
arrivals = []
t = 0
while t < SIMULATION_TIME:
    t += exponential(ARRIVAL_RATE)
    arrivals.append(t)

# Generate service start and end times
server_free_time = 0
service_periods = []
conflicts = 0
for arrival in arrivals:
    start_service = max(arrival, server_free_time)
    end_service = start_service + SERVICE_TIME
    service_periods.append((start_service, end_service))
    server_free_time = end_service

# Count number of hours with at least one overlap (conflict)
hourly_conflict = [0] * int(SIMULATION_TIME // 3600)
for i in range(1, len(service_periods)):
    prev_start, prev_end = service_periods[i - 1]
    curr_start, curr_end = service_periods[i]
    if curr_start < prev_end:
        hour_index = int(curr_start // 3600)
        hourly_conflict[hour_index] = 1

conflict_hour_prob = 100 * sum(hourly_conflict) / len(hourly_conflict)
print(f"Conflict Hour Probability: {conflict_hour_prob:.2f}%")
