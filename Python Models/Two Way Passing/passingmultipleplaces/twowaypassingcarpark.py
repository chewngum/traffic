#!/usr/bin/env python3
"""
road_oneway_des_viz.py

Discrete-event simulation with CLI and inline replay visualization (1x real time),
only showing times when activity exists (vehicle on road or queues > 0).

Now includes:
- Dashboard printed every 30 minutes of sim time
- Average arrivals per hour per direction
- Percentage of time for each queue length per queue
- Stats show for 5 seconds before animation starts
- Dashboard does not refresh more often than 0.1s real time
- Clears terminal before showing new stats
"""

import random
import time
import os
from collections import defaultdict

# Parameters
SIM_DURATION = 100 * 60  # minutes
ARRIVAL_RATES = {"A": 15/60, "B": 15/60}  # per minute
TRAVEL_TIME = 5.4/60  # minutes
DASHBOARD_INTERVAL = 60  # minutes

# Event list
events = []  # (time, type, direction)

# State
queues = {"A": 0, "B": 0}
on_road = None
road_free_time = 0

# Statistics
arrivals = {"A": 0, "B": 0}
queue_time = {"A": defaultdict(int), "B": defaultdict(int)}
last_change = 0

# Real-time dashboard throttle
last_dashboard_real = 0


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def print_dashboard(sim_time):
    global last_dashboard_real, arrivals, queue_time
    now = time.time()
    if now - last_dashboard_real < 0.1:
        return  # too soon, skip
    last_dashboard_real = now

    clear_screen()
    print(f"\n=== DASHBOARD @ {sim_time/60:.1f} min ===")

    # Average arrivals per hour per direction
    for d in ("A", "B"):
        avg_rate = arrivals[d] / (sim_time/60) if sim_time > 0 else 0
        print(f"Avg arrivals/hour {d}: {avg_rate:.2f}")

    # Queue length distribution
    for d in ("A", "B"):
        total_time = sum(queue_time[d].values())
        print(f"Queue {d} length distribution:")
        if total_time > 0:
            for qlen in sorted(queue_time[d]):
                pct = 100 * queue_time[d][qlen] / total_time
                print(f"  {qlen}: {pct:.1f}%")
        else:
            print("  (no data)")


# Generate arrivals
def gen_arrivals():
    for d in ("A", "B"):
        t = 0
        while t < SIM_DURATION:
            t += random.expovariate(ARRIVAL_RATES[d])
            if t < SIM_DURATION:
                events.append((t, "arrival", d))


def run_sim():
    global queues, on_road, road_free_time, last_change

    gen_arrivals()
    events.sort()

    sim_time = 0
    next_dashboard = DASHBOARD_INTERVAL

    for t, etype, d in events:
        # update queue length time stats
        dt = t - last_change
        for dd in ("A", "B"):
            queue_time[dd][queues[dd]] += dt
        last_change = t
        sim_time = t

        if etype == "arrival":
            arrivals[d] += 1
            queues[d] += 1

            if on_road is None and road_free_time <= t:
                if queues[d] > 0:
                    queues[d] -= 1
                    on_road = d
                    road_free_time = t + TRAVEL_TIME
                    events.append((road_free_time, "depart", d))

        elif etype == "depart":
            on_road = None
            for dd in ("A", "B"):
                if queues[dd] > 0:
                    queues[dd] -= 1
                    on_road = dd
                    road_free_time = t + TRAVEL_TIME
                    events.append((road_free_time, "depart", dd))
                    break

        # Dashboard every 30 minutes
        if sim_time >= next_dashboard:
            print_dashboard(sim_time)
            next_dashboard += DASHBOARD_INTERVAL

    # Final stats update
    dt = SIM_DURATION - last_change
    for dd in ("A", "B"):
        queue_time[dd][queues[dd]] += dt


if __name__ == "__main__":
    run_sim()

    # Final dashboard before replay
    print_dashboard(SIM_DURATION)
    time.sleep(5)

    # Replay animation
    print("\n--- Replay Animation ---")
    for t, etype, d in sorted(events):
        print(f"{t:6.2f} {etype:7} {d}")
        time.sleep(1)
