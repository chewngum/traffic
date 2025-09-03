import random
import heapq
from collections import defaultdict

# --- Configurable Parameters ---
SIMULATION_HOURS = 1000
ENTRY_RATE = 15      # cars/hour arriving to be parked
EXIT_RATE = 15        # people/hour arriving to retrieve
ENTRY_SERVICE_TIME = 5.4  # seconds to store
EXIT_SERVICE_TIME = 5.4   # seconds to retrieve
NUM_SEEDS = 100
PRIORITY = "FCFS"  # options: "FCFS", "CARS", "PEOPLE"


def run_simulation(seed):
    random.seed(seed)
    SIM_TIME = SIMULATION_HOURS * 3600

    # Event list: (time, type)
    FEL = []
    if ENTRY_RATE > 0:
        heapq.heappush(FEL, (random.expovariate(ENTRY_RATE/3600), "arrival_entry"))
    if EXIT_RATE > 0:
        heapq.heappush(FEL, (random.expovariate(EXIT_RATE/3600), "arrival_exit"))

    # State
    entry_queue, exit_queue = [], []
    server_busy_until = 0.0

    # Statistics
    busy_time = 0.0
    last_time = 0.0
    queue_length_time_entry = defaultdict(float)
    queue_length_time_exit = defaultdict(float)
    max_queue_entry = defaultdict(int)  # hours with max queue length
    max_queue_exit = defaultdict(int)

    delayed_entry, total_entry = 0, 0
    delayed_exit, total_exit = 0, 0

    entry_wait_times, exit_wait_times = [], []

    while FEL:
        time, event = heapq.heappop(FEL)
        if time > SIM_TIME:
            break

        # Record queue length time
        dt = time - last_time
        if entry_queue:
            queue_length_time_entry[len(entry_queue)] += dt
        else:
            queue_length_time_entry[0] += dt
        if exit_queue:
            queue_length_time_exit[len(exit_queue)] += dt
        else:
            queue_length_time_exit[0] += dt
        last_time = time

        if event == "arrival_entry":
            total_entry += 1
            entry_queue.append(time)
            heapq.heappush(FEL, (time + random.expovariate(ENTRY_RATE/3600), "arrival_entry"))

        elif event == "arrival_exit":
            total_exit += 1
            exit_queue.append(time)
            heapq.heappush(FEL, (time + random.expovariate(EXIT_RATE/3600), "arrival_exit"))

        elif event == "departure":
            server_busy_until = time

        # Start service if machine free
        if time >= server_busy_until:
            chosen = None
            if entry_queue or exit_queue:
                if PRIORITY == "FCFS":
                    if entry_queue and exit_queue:
                        if entry_queue[0] <= exit_queue[0]:
                            chosen = ("entry", entry_queue.pop(0))
                        else:
                            chosen = ("exit", exit_queue.pop(0))
                    elif entry_queue:
                        chosen = ("entry", entry_queue.pop(0))
                    elif exit_queue:
                        chosen = ("exit", exit_queue.pop(0))
                elif PRIORITY == "CARS":
                    if entry_queue:
                        chosen = ("entry", entry_queue.pop(0))
                    elif exit_queue:
                        chosen = ("exit", exit_queue.pop(0))
                elif PRIORITY == "PEOPLE":
                    if exit_queue:
                        chosen = ("exit", exit_queue.pop(0))
                    elif entry_queue:
                        chosen = ("entry", entry_queue.pop(0))

            if chosen:
                kind, arrival_time = chosen
                wait = time - arrival_time
                if kind == "entry":
                    if wait > 0: delayed_entry += 1
                    entry_wait_times.append(wait)
                    service_time = ENTRY_SERVICE_TIME
                else:
                    if wait > 0: delayed_exit += 1
                    exit_wait_times.append(wait)
                    service_time = EXIT_SERVICE_TIME
                finish_time = time + service_time
                heapq.heappush(FEL, (finish_time, "departure"))
                busy_time += service_time
                server_busy_until = finish_time

        # Record max queue per hour
        hour = int(time // 3600)
        max_queue_entry[hour] = max(max_queue_entry[hour], len(entry_queue))
        max_queue_exit[hour] = max(max_queue_exit[hour], len(exit_queue))

    # Aggregate stats
    total_time = SIM_TIME
    utilisation = busy_time / total_time

    def histogram_to_pct(hist):
        return {k: v/total_time*100 for k, v in hist.items()}

    def max_histogram_to_pct(max_hist):
        counts = defaultdict(int)
        for h, q in max_hist.items():
            counts[q] += 1
        return {k: v/SIMULATION_HOURS*100 for k, v in counts.items()}

    entry_hist = histogram_to_pct(queue_length_time_entry)
    exit_hist = histogram_to_pct(queue_length_time_exit)
    entry_max_hist = max_histogram_to_pct(max_queue_entry)
    exit_max_hist = max_histogram_to_pct(max_queue_exit)

    avg_wait_entry_arrival = sum(entry_wait_times)/total_entry if total_entry > 0 else 0
    avg_wait_entry_queued = (sum([w for w in entry_wait_times if w > 0]) / delayed_entry
                             if delayed_entry > 0 else 0)
    avg_wait_exit_arrival = sum(exit_wait_times)/total_exit if total_exit > 0 else 0
    avg_wait_exit_queued = (sum([w for w in exit_wait_times if w > 0]) / delayed_exit
                            if delayed_exit > 0 else 0)

    return {
        "utilisation": utilisation,
        "delay_entry": delayed_entry/total_entry if total_entry > 0 else 0,
        "delay_exit": delayed_exit/total_exit if total_exit > 0 else 0,
        "entry_hist": entry_hist,
        "exit_hist": exit_hist,
        "entry_max_hist": entry_max_hist,
        "exit_max_hist": exit_max_hist,
        "avg_wait_entry_arrival": avg_wait_entry_arrival,
        "avg_wait_entry_queued": avg_wait_entry_queued,
        "avg_wait_exit_arrival": avg_wait_exit_arrival,
        "avg_wait_exit_queued": avg_wait_exit_queued,
    }


# --- Averaging over seeds ---
def average_results():
    agg = defaultdict(float)
    agg_entry_hist = defaultdict(float)
    agg_exit_hist = defaultdict(float)
    agg_entry_max = defaultdict(float)
    agg_exit_max = defaultdict(float)

    for s in range(NUM_SEEDS):
        r = run_simulation(s)
        agg["utilisation"] += r["utilisation"]
        agg["delay_entry"] += r["delay_entry"]
        agg["delay_exit"] += r["delay_exit"]
        agg["avg_wait_entry_arrival"] += r["avg_wait_entry_arrival"]
        agg["avg_wait_entry_queued"] += r["avg_wait_entry_queued"]
        agg["avg_wait_exit_arrival"] += r["avg_wait_exit_arrival"]
        agg["avg_wait_exit_queued"] += r["avg_wait_exit_queued"]

        for k, v in r["entry_hist"].items():
            agg_entry_hist[k] += v
        for k, v in r["exit_hist"].items():
            agg_exit_hist[k] += v
        for k, v in r["entry_max_hist"].items():
            agg_entry_max[k] += v
        for k, v in r["exit_max_hist"].items():
            agg_exit_max[k] += v

    # Average
    for k in agg: agg[k] /= NUM_SEEDS
    for k in agg_entry_hist: agg_entry_hist[k] /= NUM_SEEDS
    for k in agg_exit_hist: agg_exit_hist[k] /= NUM_SEEDS
    for k in agg_entry_max: agg_entry_max[k] /= NUM_SEEDS
    for k in agg_exit_max: agg_exit_max[k] /= NUM_SEEDS

    return agg, agg_entry_hist, agg_exit_hist, agg_entry_max, agg_exit_max


def print_table(name, hist, max_hist, avg_wait_arrival, avg_wait_queued):
    print(f"\n{name} Queue Histogram")
    print("Len   %Time     %Hours Max")
    max_len = max(max(hist.keys(), default=0), max(max_hist.keys(), default=0))
    for l in range(max_len+1):
        t = hist.get(l, 0)
        m = max_hist.get(l, 0)
        print(f"{l:<5d} {t:7.2f}   {m:7.2f}")
    print(f"\nAverage wait time per arrival: {avg_wait_arrival:.2f} s")
    print(f"Average wait time per queued vehicle: {avg_wait_queued:.2f} s")


if __name__ == "__main__":
    agg, entry_hist, exit_hist, entry_max, exit_max = average_results()

    print(f"\n--- Averaged over {NUM_SEEDS} seeds ---")
    print(f"Utilisation: {agg['utilisation']*100:.2f}%")
    print(f"Probability of delay (Entry): {agg['delay_entry']*100:.2f}%")
    print(f"Probability of delay (Exit):  {agg['delay_exit']*100:.2f}%")

    print_table("Entry", entry_hist, entry_max,
                agg["avg_wait_entry_arrival"], agg["avg_wait_entry_queued"])
    print_table("Exit", exit_hist, exit_max,
                agg["avg_wait_exit_arrival"], agg["avg_wait_exit_queued"])
