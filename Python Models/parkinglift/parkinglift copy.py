import numpy as np
from collections import deque, defaultdict
import heapq

def lift_simulation_queue_correct(arrival_rate_up_per_hour, arrival_rate_down_per_hour, time_between_floors, hours, seed=None):
    """
    Event-driven single-passenger lift simulation with correct queue lengths.
    Returns numeric statistics for averaging across multiple seeds.
    """
    if seed is not None:
        np.random.seed(seed)

    total_seconds = hours * 3600
    arrival_rate_up = arrival_rate_up_per_hour / 3600
    arrival_rate_down = arrival_rate_down_per_hour / 3600

    # Generate arrivals
    up_arrivals = np.cumsum(np.random.exponential(1 / arrival_rate_up, int(total_seconds * arrival_rate_up * 2)))
    up_arrivals = up_arrivals[up_arrivals < total_seconds]
    down_arrivals = np.cumsum(np.random.exponential(1 / arrival_rate_down, int(total_seconds * arrival_rate_down * 2)))
    down_arrivals = down_arrivals[down_arrivals < total_seconds]

    # Initialize queues
    queue_up = deque()
    queue_down = deque()
    wait_times_up = []
    wait_times_down = []

    # Queue length tracking
    queue_history_up = defaultdict(float)
    queue_history_down = defaultdict(float)
    last_event_time = 0

    # Event queue: (event_time, event_type, direction)
    events = []
    for t in up_arrivals:
        heapq.heappush(events, (t, "arrival", "up"))
    for t in down_arrivals:
        heapq.heappush(events, (t, "arrival", "down"))

    lift_busy_until = 0
    lift_location = 'lobby'
    passengers_in_lift_time = 0
    lift_moving_time = 0

    while events:
        t, event_type, direction = heapq.heappop(events)

        # Update queue length durations
        queue_history_up[len(queue_up)] += t - last_event_time
        queue_history_down[len(queue_down)] += t - last_event_time
        last_event_time = t

        if event_type == "arrival":
            if direction == "up":
                queue_up.append(t)
            else:
                queue_down.append(t)

            # If lift idle, schedule service
            if lift_busy_until <= t and (queue_up or queue_down):
                heapq.heappush(events, (t, "lift_free", None))

        elif event_type == "lift_free":
            if queue_up:
                arrival_time = queue_up.popleft()
                wait_times_up.append(max(0, lift_busy_until - arrival_time))
            elif queue_down:
                arrival_time = queue_down.popleft()
                wait_times_down.append(max(0, lift_busy_until - arrival_time))
            else:
                continue

            # Return to lobby if needed
            if lift_location != 'lobby':
                lift_moving_time += time_between_floors
                lift_busy_until = max(lift_busy_until, t) + time_between_floors

            # Move to passenger
            lift_moving_time += time_between_floors
            passengers_in_lift_time += time_between_floors
            lift_busy_until = max(lift_busy_until, t) + time_between_floors
            lift_location = 'destination'

            # Return to lobby
            lift_moving_time += time_between_floors
            lift_busy_until += time_between_floors
            lift_location = 'lobby'

            # Schedule next lift_free if queue not empty
            if queue_up or queue_down:
                heapq.heappush(events, (lift_busy_until, "lift_free", None))

    # Update remaining queue lengths until simulation end
    queue_history_up[len(queue_up)] += total_seconds - last_event_time
    queue_history_down[len(queue_down)] += total_seconds - last_event_time

    # Return numeric statistics
    percent_time_in_lift = passengers_in_lift_time / total_seconds * 100
    percent_time_moving = lift_moving_time / total_seconds * 100
    avg_arrivals_up = len(up_arrivals) / hours
    avg_arrivals_down = len(down_arrivals) / hours
    avg_wait_up = np.mean(wait_times_up) if wait_times_up else 0
    avg_wait_down = np.mean(wait_times_down) if wait_times_down else 0

    return {
        "percent_time_in_lift": percent_time_in_lift,
        "percent_time_moving": percent_time_moving,
        "avg_arrivals_up": avg_arrivals_up,
        "avg_arrivals_down": avg_arrivals_down,
        "avg_wait_up": avg_wait_up,
        "avg_wait_down": avg_wait_down,
        "queue_history_up": queue_history_up,
        "queue_history_down": queue_history_down
    }

# --- Run 100 seeds × 100 hours ---
hours = 1000
num_seeds = 10
all_stats = []

for seed in range(num_seeds):
    stats = lift_simulation_queue_correct(
        arrival_rate_up_per_hour=15,
        arrival_rate_down_per_hour=15,
        time_between_floors=5.4,
        hours=hours,
        seed=seed
    )
    all_stats.append(stats)

# Average numeric statistics
def average_dict(dict_list):
    avg_dict = {}
    keys = dict_list[0].keys()
    for k in keys:
        if 'queue_history' in k:
            continue
        avg_dict[k] = np.mean([d[k] for d in dict_list])
    return avg_dict

avg_stats = average_dict(all_stats)

# Print formatted averages
print(f"Average over {num_seeds} seeds ({hours} hours each):")
print(f"Percent time passenger is in lift: {avg_stats['percent_time_in_lift']:.2f}%")
print(f"Percent time lift is moving: {avg_stats['percent_time_moving']:.2f}%")
print(f"Average arrivals UP per hour: {avg_stats['avg_arrivals_up']:.1f} / hr")
print(f"Average arrivals DOWN per hour: {avg_stats['avg_arrivals_down']:.1f} / hr")
print(f"Average wait time UP: {avg_stats['avg_wait_up']:.1f} secs")
print(f"Average wait time DOWN: {avg_stats['avg_wait_down']:.1f} secs\n")

# --- Compute average queue length percentages across seeds ---
def average_queue_history(all_stats, direction):
    totals = defaultdict(list)
    key = f"queue_history_{direction}"
    for stats in all_stats:
        for q_len, t in stats[key].items():
            totals[q_len].append(t)
    avg_percentages = {}
    total_time = hours * 3600
    for q_len, times in totals.items():
        avg_percentages[q_len] = np.mean(times) / total_time * 100
    return avg_percentages

avg_queue_up = average_queue_history(all_stats, "up")
avg_queue_down = average_queue_history(all_stats, "down")

# Print average queue tables
def print_avg_queue_table(avg_queue, direction):
    print(f"Average Queue Length Time Percentages ({direction.upper()}):")
    print("Queue Length | Avg Time Percentage (%)")
    for length in sorted(avg_queue.keys()):
        print(f"{length:12} | {avg_queue[length]:17.2f}")
    print()

print_avg_queue_table(avg_queue_up, "up")
print_avg_queue_table(avg_queue_down, "down")
