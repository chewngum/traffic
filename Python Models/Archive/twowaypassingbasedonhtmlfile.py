#!/usr/bin/env python3
import math
import heapq
import random
from collections import Counter, defaultdict
from typing import Dict, List, Tuple

# =======================
# Configuration
# =======================
NUM_SEEDS = 1000
SIMULATION_HOURS = 100
ARRIVAL_RATE_A = 15.0  # cars/hour
ARRIVAL_RATE_B = 15.0  # cars/hour
ROAD_LENGTH_M = 30.0   # meters
CAR_SPEED_KMH = 20.0   # km/h

# Optional: non-blocking warning (mirrors your frontend guidance)
if NUM_SEEDS * SIMULATION_HOURS < 100_000:
    print("Warning: seeds × hours < 100,000. Results may be noisy.\n")

# =======================
# Derived constants
# =======================
CAR_SPEED_MPS = CAR_SPEED_KMH * 1000.0 / 3600.0
TRAVERSAL_TIME_S = ROAD_LENGTH_M / CAR_SPEED_MPS
SIM_TIME_S = SIMULATION_HOURS * 3600.0

ARRIVAL_LAMBDA_A = ARRIVAL_RATE_A / 3600.0  # per second
ARRIVAL_LAMBDA_B = ARRIVAL_RATE_B / 3600.0  # per second


def exp_time(rng: random.Random, rate_per_sec: float) -> float:
    """Sample exponential interarrival; inf if rate is 0."""
    if rate_per_sec <= 0.0:
        return float("inf")
    u = rng.random()
    while u <= 0.0:
        u = rng.random()
    return -math.log(u) / rate_per_sec


def run_single_simulation(seed: int) -> Dict:
    """
    Single-lane event simulation aligned with the JS logic:
      - Events: ARRIVAL_A, ARRIVAL_B, DEPARTURE
      - One shared road; at most one car traversing at a time
      - FCFS across both queues by earliest arrival time when road frees
      - Stats: hourly max queues, time-at-queue-length, queueing events,
               two-way conflicts (opposite dir), one-way conflicts (same dir),
               road utilization
    """
    rng = random.Random(seed)

    # State
    time = 0.0
    road_occupied = False
    road_by = None           # 'A' or 'B' or None
    road_since = 0.0

    queueA: List[float] = []  # holds arrival timestamps
    queueB: List[float] = []

    # Stats
    hourly_max_A: List[int] = []
    hourly_max_B: List[int] = []
    current_hour = 0
    current_hour_max_A = 0
    current_hour_max_B = 0

    queue_time_A = defaultdict(float)  # key: queue length (int), value: seconds
    queue_time_B = defaultdict(float)

    last_event_time = 0.0
    queueing_events = 0
    two_way_conflicts = 0
    one_way_conflicts = 0
    total_road_occupied = 0.0

    # Event heap: (time, seq, type)
    seq = 0
    evheap: List[Tuple[float, int, str]] = []

    # Seed first arrivals
    if ARRIVAL_RATE_A > 0:
        heapq.heappush(evheap, (exp_time(rng, ARRIVAL_LAMBDA_A), seq, "ARRIVAL_A")); seq += 1
    if ARRIVAL_RATE_B > 0:
        heapq.heappush(evheap, (exp_time(rng, ARRIVAL_LAMBDA_B), seq, "ARRIVAL_B")); seq += 1

    while time < SIM_TIME_S and evheap:
        event_time, _, etype = heapq.heappop(evheap)

        if event_time > SIM_TIME_S:
            event_time = SIM_TIME_S

        # Accumulate queue-time slices
        dt = event_time - last_event_time
        if dt > 0:
            queue_time_A[len(queueA)] += dt
            queue_time_B[len(queueB)] += dt
            last_event_time = event_time

        time = event_time

        # Hour rollover (record at transition)
        new_hour = int(time // 3600)
        if new_hour > current_hour:
            hourly_max_A.append(max(current_hour_max_A, len(queueA)))
            hourly_max_B.append(max(current_hour_max_B, len(queueB)))
            current_hour_max_A = len(queueA)
            current_hour_max_B = len(queueB)
            current_hour = new_hour

        if etype == "ARRIVAL_A":
            if road_occupied:
                # queues because road is in use
                queueA.append(time)
                queueing_events += 1
                if road_by == "B":
                    two_way_conflicts += 1
                elif road_by == "A":
                    one_way_conflicts += 1
                current_hour_max_A = max(current_hour_max_A, len(queueA))
            else:
                # take road immediately
                road_occupied = True
                road_by = "A"
                road_since = time
                heapq.heappush(evheap, (time + TRAVERSAL_TIME_S, seq, "DEPARTURE")); seq += 1

            # schedule next A arrival
            if ARRIVAL_RATE_A > 0:
                heapq.heappush(evheap, (time + exp_time(rng, ARRIVAL_LAMBDA_A), seq, "ARRIVAL_A")); seq += 1

        elif etype == "ARRIVAL_B":
            if road_occupied:
                queueB.append(time)
                queueing_events += 1
                if road_by == "A":
                    two_way_conflicts += 1
                elif road_by == "B":
                    one_way_conflicts += 1
                current_hour_max_B = max(current_hour_max_B, len(queueB))
            else:
                road_occupied = True
                road_by = "B"
                road_since = time
                heapq.heappush(evheap, (time + TRAVERSAL_TIME_S, seq, "DEPARTURE")); seq += 1

            # schedule next B arrival
            if ARRIVAL_RATE_B > 0:
                heapq.heappush(evheap, (time + exp_time(rng, ARRIVAL_LAMBDA_B), seq, "ARRIVAL_B")); seq += 1

        elif etype == "DEPARTURE":
            # utilization slice
            total_road_occupied += (time - road_since)
            road_occupied = False
            road_by = None

            # pick next by earliest queued arrival
            next_dir = None
            next_t = float("inf")
            if queueA and queueA[0] < next_t:
                next_t = queueA[0]; next_dir = "A"
            if queueB and queueB[0] < next_t:
                next_t = queueB[0]; next_dir = "B"

            if next_dir == "A":
                queueA.pop(0)
                road_occupied = True
                road_by = "A"
                road_since = time
                heapq.heappush(evheap, (time + TRAVERSAL_TIME_S, seq, "DEPARTURE")); seq += 1
            elif next_dir == "B":
                queueB.pop(0)
                road_occupied = True
                road_by = "B"
                road_since = time
                heapq.heappush(evheap, (time + TRAVERSAL_TIME_S, seq, "DEPARTURE")); seq += 1
            # else: stays free

        # update current-hour max after state changed
        current_hour_max_A = max(current_hour_max_A, len(queueA))
        current_hour_max_B = max(current_hour_max_B, len(queueB))

        if time >= SIM_TIME_S:
            break

    # tail slice if any
    if last_event_time < SIM_TIME_S:
        dt_tail = SIM_TIME_S - last_event_time
        queue_time_A[len(queueA)] += dt_tail
        queue_time_B[len(queueB)] += dt_tail

    # ensure final hourly entry
    if len(hourly_max_A) < SIMULATION_HOURS:
        hourly_max_A.append(max(current_hour_max_A, len(queueA)))
        hourly_max_B.append(max(current_hour_max_B, len(queueB)))

    road_util_percent = (total_road_occupied / SIM_TIME_S) * 100.0

    return {
        "hourlyMaxQueueA": hourly_max_A[:SIMULATION_HOURS],
        "hourlyMaxQueueB": hourly_max_B[:SIMULATION_HOURS],
        "queueTimeA": dict(queue_time_A),
        "queueTimeB": dict(queue_time_B),
        "queueingEvents": queueing_events,
        "twoWayConflictEvents": two_way_conflicts,
        "oneWayConflictEvents": one_way_conflicts,
        "roadUtilization": road_util_percent,
    }


def run_multiple_simulations(num_seeds: int) -> Dict:
    allA = Counter()
    allB = Counter()
    total_queue_time_A = Counter()
    total_queue_time_B = Counter()

    total_queueing = 0
    total_two_way = 0
    total_one_way = 0
    total_road_util = 0.0

    for seed in range(1, num_seeds + 1):
        res = run_single_simulation(seed)
        allA.update(res["hourlyMaxQueueA"])
        allB.update(res["hourlyMaxQueueB"])
        total_queueing += res["queueingEvents"]
        total_two_way += res["twoWayConflictEvents"]
        total_one_way += res["oneWayConflictEvents"]
        total_road_util += res["roadUtilization"]
        total_queue_time_A.update(res["queueTimeA"])
        total_queue_time_B.update(res["queueTimeB"])

    total_hours = num_seeds * SIMULATION_HOURS
    total_sim_time = num_seeds * SIM_TIME_S

    # % of hours with each maximum queue length
    maxA = max(allA.keys() or [0])
    maxB = max(allB.keys() or [0])
    percentagesA = {q: (allA[q] / total_hours * 100.0) for q in range(0, maxA + 1)}
    percentagesB = {q: (allB[q] / total_hours * 100.0) for q in range(0, maxB + 1)}

    # % of total time at each queue length
    keysA = set(total_queue_time_A.keys()) | set(range(0, maxA + 1))
    keysB = set(total_queue_time_B.keys()) | set(range(0, maxB + 1))
    timePctA = {q: (total_queue_time_A[q] / total_sim_time * 100.0) if total_sim_time > 0 else 0.0
                for q in sorted(keysA)}
    timePctB = {q: (total_queue_time_B[q] / total_sim_time * 100.0) if total_sim_time > 0 else 0.0
                for q in sorted(keysB)}

    return {
        "percentagesA": percentagesA,
        "percentagesB": percentagesB,
        "timePctA": timePctA,
        "timePctB": timePctB,
        "avgQueueingEventsPerHour": total_queueing / total_hours if total_hours else 0.0,
        "avgTwoWayConflictEventsPerHour": total_two_way / total_hours if total_hours else 0.0,
        "avgOneWayConflictEventsPerHour": total_one_way / total_hours if total_hours else 0.0,
        "avgRoadUtilization": total_road_util / num_seeds if num_seeds else 0.0,
    }


def print_distribution(title: str, perc_hours: Dict[int, float], time_pct: Dict[int, float]) -> None:
    print(f"\n{title}")
    print(f"{'Queue Len':<10} {'% Hours (max)':>14} {'(cum)':>8} {'% Total Time':>14}")
    cum = 0.0
    all_qs = sorted(set(perc_hours.keys()) | set(time_pct.keys()))
    for q in all_qs:
        p = perc_hours.get(q, 0.0)
        cum += p
        t = time_pct.get(q, 0.0)
        print(f"{q:<10} {p:>14.2f} {cum:>8.2f} {t:>14.2f}")


def main():
    results = run_multiple_simulations(NUM_SEEDS)

    print("\n=== One-Lane Road Traffic Simulation (Python) ===")
    print(f"Road Length: {ROAD_LENGTH_M:.0f} m, Speed: {CAR_SPEED_KMH:.1f} km/h, "
          f"Traversal Time: {TRAVERSAL_TIME_S:.2f} s")
    print(f"Arrival A→B: {ARRIVAL_RATE_A:.2f} cars/h, Arrival B→A: {ARRIVAL_RATE_B:.2f} cars/h")
    print(f"Seeds: {NUM_SEEDS}, Hours/seed: {SIMULATION_HOURS}, Total hours: {NUM_SEEDS * SIMULATION_HOURS}")

    print_distribution("Direction A → B",
                       results["percentagesA"], results["timePctA"])
    print_distribution("Direction B → A",
                       results["percentagesB"], results["timePctB"])

    print("\nSummary Statistics")
    print(f"{'Avg Queueing Events / Hour:':<32}{results['avgQueueingEventsPerHour']:.3f}")
    print(f"{'Two-Way Conflict Events / Hour:':<32}{results['avgTwoWayConflictEventsPerHour']:.3f}")
    print(f"{'One-Way Conflict Events / Hour:':<32}{results['avgOneWayConflictEventsPerHour']:.3f}")
    print(f"{'Avg Road Utilization:':<32}{results['avgRoadUtilization']:.2f}%")

if __name__ == "__main__":
    main()
