import numpy as np

def simulate_conflicts(arrival_rate_A, arrival_rate_B, seed):
    np.random.seed(seed)

    SECONDS_PER_HOUR = 3600
    SIMULATION_HOURS = 1020
    ACTIVE_HOURS = range(10, SIMULATION_HOURS-10)
    ROAD_LENGTH_METERS = 30
    SPEED_KMPH = 20
    SPEED_MPS = SPEED_KMPH * 1000 / 3600
    TIME_ON_ROAD = ROAD_LENGTH_METERS / SPEED_MPS

    def generate_arrivals(rate_per_hour):
        arrivals = []
        for hour in range(SIMULATION_HOURS):
            n = np.random.poisson(rate_per_hour)
            if hasattr(n, "__len__") and not isinstance(n, int):
                n = n[0]
            if n > 0:
                times = np.sort(np.random.uniform(0, SECONDS_PER_HOUR, n)) + hour * SECONDS_PER_HOUR
                arrivals.extend(times)
        return np.array(arrivals)

    arrivals_A = generate_arrivals(arrival_rate_A)
    arrivals_B = generate_arrivals(arrival_rate_B)

    def apply_same_direction_filter(arrivals):
        filtered = []
        last_end_time = -np.inf
        for arrival in arrivals:
            if arrival >= last_end_time:
                filtered.append(arrival)
                last_end_time = arrival + TIME_ON_ROAD
        return np.array(filtered)

    arrivals_A = apply_same_direction_filter(arrivals_A)
    arrivals_B = apply_same_direction_filter(arrivals_B)

    def assign_to_hours(arrival_times):
        hour_dict = {}
        for t in arrival_times:
            mid_hour = int((t + t + TIME_ON_ROAD) // 2 // SECONDS_PER_HOUR)
            if mid_hour not in hour_dict:
                hour_dict[mid_hour] = []
            hour_dict[mid_hour].append((t, t + TIME_ON_ROAD))
        return hour_dict

    active_A = assign_to_hours(arrivals_A)
    active_B = assign_to_hours(arrivals_B)

    conflict_hours = 0
    for h in ACTIVE_HOURS:
        conflicts = 0
        if h in active_A and h in active_B:
            for a_start, a_end in active_A[h]:
                for b_start, b_end in active_B[h]:
                    if a_start < b_end and b_start < a_end:
                        conflicts += 1
                        break
        if conflicts > 0:
            conflict_hours += 1

    return conflict_hours / len(ACTIVE_HOURS) * 100

def average_conflicts(rate_A, rate_B, num_seeds = 100):
    total = 0.0
    for seed in range(1, num_seeds + 1):
        percent = simulate_conflicts(rate_A, rate_B, seed)
        total += percent
    return round(total / num_seeds, 2)

def run_conflict_sweep():
    results_fixed_total = []
    for a_rate in range(1, 16):
        b_rate = 30 - a_rate
        avg_conflict = average_conflicts(a_rate, b_rate)
        results_fixed_total.append((a_rate, b_rate, avg_conflict))

    results_equal = []
    for rate in range(1, 31):
        avg_conflict = average_conflicts(rate, rate)
        results_equal.append((rate, rate, avg_conflict))

    print("A + B = 30 results:")
    for res in results_fixed_total:
        print(f"A: {res[0]}, B: {res[1]} → {res[2]}% conflict hours")

    print("\nA = B results:")
    for res in results_equal:
        print(f"A = B = {res[0]} → {res[2]}% conflict hours")

run_conflict_sweep()
# Reminder: Do not run this in production context; just code output as requested.
