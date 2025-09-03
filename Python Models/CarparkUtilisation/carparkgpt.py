import heapq
import random
from collections import defaultdict

def simulate_carpark(arrival_rate_per_hour, capacity, avg_stay_seconds, 
                     policy="queue", sim_hours=12, seed=None):
    """
    Simulate a carpark with Poisson arrivals and exponential stay times.
    """
    if seed is not None:
        random.seed(seed)

    # Convert inputs
    sim_time = sim_hours * 3600  # seconds
    arrival_rate = arrival_rate_per_hour / 3600.0  # per second
    mean_interarrival = 1 / arrival_rate  # seconds

    # State variables
    time = 0.0
    occupied = 0
    queue = []
    arrivals = 0
    departures = 0
    blocked = 0
    wait_times = []

    # Queue length time tracking
    queue_length_time = {}
    last_event_time = 0.0

    # Track maximum queue per hour
    hourly_max_queues = defaultdict(int)

    # Event list: (event_time, event_type, car_id)
    events = []
    car_id = 0

    # Schedule first arrival
    first_arrival = random.expovariate(1 / mean_interarrival)
    heapq.heappush(events, (first_arrival, "arrival", car_id))

    # Simulation loop
    while events:
        event_time, event_type, cid = heapq.heappop(events)

        if event_time > sim_time:
            break

        # Update queue length time
        elapsed = event_time - last_event_time
        q_len = len(queue)
        queue_length_time[q_len] = queue_length_time.get(q_len, 0) + elapsed
        last_event_time = event_time

        # Update hourly max queue length
        hour_index = int(event_time // 3600)
        hourly_max_queues[hour_index] = max(hourly_max_queues[hour_index], q_len)

        time = event_time

        if event_type == "arrival":
            arrivals += 1

            if occupied < capacity:
                occupied += 1
                stay = random.expovariate(1 / avg_stay_seconds)
                heapq.heappush(events, (time + stay, "departure", cid))
            else:
                if policy == "queue":
                    queue.append((cid, time))
                elif policy == "block":
                    blocked += 1

            # Schedule next arrival
            car_id += 1
            interarrival = random.expovariate(1 / mean_interarrival)
            next_arrival = time + interarrival
            if next_arrival <= sim_time:
                heapq.heappush(events, (next_arrival, "arrival", car_id))

        elif event_type == "departure":
            departures += 1
            occupied -= 1

            if queue:
                next_cid, arrival_time = queue.pop(0)
                wait_times.append(time - arrival_time)
                occupied += 1
                stay = random.expovariate(1 / avg_stay_seconds)
                heapq.heappush(events, (time + stay, "departure", next_cid))

    # Final update for queue length time
    elapsed = sim_time - last_event_time
    q_len = len(queue)
    queue_length_time[q_len] = queue_length_time.get(q_len, 0) + elapsed

    # Normalize queue length time into percentages
    queue_length_percent = {ql: (t / sim_time) * 100 
                            for ql, t in sorted(queue_length_time.items())}

    # Utilization (approximation using occupied spaces vs capacity)
    total_occupied_time = 0.0
    for ql, t in queue_length_time.items():
        effective_occupied = capacity if ql > 0 else min(occupied, capacity)
        total_occupied_time += effective_occupied * t

    utilization = total_occupied_time / (capacity * sim_time) * 100

    # Compute % of hours with each maximum queue length
    max_queue_counts = defaultdict(int)
    for h, q in hourly_max_queues.items():
        max_queue_counts[q] += 1
    total_hours = sim_hours
    max_queue_percent = {q: (c / total_hours) * 100 for q, c in sorted(max_queue_counts.items())}

    results = {
        "arrivals": arrivals,
        "departures": departures,
        "blocked": blocked,
        "queue_length_percent": queue_length_percent,
        "hourly_max_queue_percent": max_queue_percent,
        "avg_wait_time": (sum(wait_times) / len(wait_times)) if wait_times else 0,
        "utilization_percent": utilization
    }

    return results


if __name__ == "__main__":
    # Example: user inputs
    lam = float(input("Enter arrival rate (cars per hour): "))
    cap = int(input("Enter number of spaces: "))
    stay = float(input("Enter average stay period (seconds): "))
    pol = input("Policy when full? ('queue' or 'block'): ").strip().lower()
    hours = int(input("Simulation duration (hours): "))

    results = simulate_carpark(lam, cap, stay, pol, hours)

    print("\n--- Simulation Results ---")
    print(f"Total arrivals: {results['arrivals']}")
    print(f"Total departures: {results['departures']}")
    print(f"Blocked cars: {results['blocked']}")
    print(f"Utilization: {results['utilization_percent']:.2f}%")
    print(f"Average wait time: {results['avg_wait_time']:.2f} seconds")

    print("\nQueue length distribution (% of time):")
    for ql, pct in results["queue_length_percent"].items():
        print(f"  {ql}: {pct:.2f}%")

    print("\nHourly maximum queue length distribution (% of hours):")
    for ql, pct in results["hourly_max_queue_percent"].items():
        print(f"  {ql}: {pct:.2f}%")
