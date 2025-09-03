#!/usr/bin/env python3
"""
road_oneway_des_viz.py

Discrete-event simulation with CLI and inline replay visualization (1x real time),
only showing times when activity exists (vehicle on road or queues > 0).

1 char = 5 m scale for segment drawing.
"""

import heapq
import math
import os
import random
import sys
import time
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import numpy as np

# ---------------- Event types ----------------
ARRIVAL_A = 1
ARRIVAL_B = 2
RELEASE = 3       # release a vehicle into a one-way segment
CLEAR = 4         # vehicle clears a segment
GREEN_CHECK = 5   # check to start green for a one-way

@dataclass(order=True)
class Event:
    t: float
    kind: int
    payload: dict = field(compare=False, default_factory=dict)

# ---------------- CLI helpers ----------------
def show_road_diagram(segments):
    diagram = []
    for seg in segments:
        if seg["type"] == "two-way":
            diagram.append(f"<=>({seg['length']}m)")
        elif seg["type"] == "one-way":
            diagram.append(f"--X--({seg['length']}m)")
    print("\nCurrent Road Layout (A ---> B):")
    if diagram:
        print(" --- ".join(diagram))
    else:
        print("[no segments defined]")
    print()

def configure_segments_cli():
    segments = []
    seg_id = 1
    while True:
        seg_type = input(f"Segment {seg_id} type (one-way/two-way, delete, ENTER to stop): ").strip().lower()
        if seg_type == "":
            break
        if seg_type == "delete":
            if segments:
                removed = segments.pop()
                print(f"Removed last segment: {removed['type']} ({removed['length']}m)")
                seg_id = max(1, seg_id - 1)
                show_road_diagram(segments)
            else:
                print("No segments to delete.")
            continue
        if seg_type not in ("one-way", "two-way"):
            print("Invalid type, must be 'one-way' or 'two-way'.")
            continue
        try:
            length = float(input(f"Length of segment {seg_id} (m): ").strip())
        except:
            print("Invalid length.")
            continue
        segments.append({"id": seg_id, "type": seg_type, "length": length})
        show_road_diagram(segments)
        seg_id += 1
    return segments

# ---------------- Simulation ----------------
class RoadDES:
    def __init__(
        self,
        segments: List[Dict],
        speed_mps: float,
        sim_duration_s: float,
        min_gap: float,
        vehicle_length_m: float,
        queue_space_m: float,
        switch_over_s: float,
        lambda_a_per_s: float,
        lambda_b_per_s: float,
        warmup_s: float = 0.0,
        seed: Optional[int] = None,
    ):
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)
        self.segments = segments
        self.speed = speed_mps
        self.sim_duration = sim_duration_s
        self.min_gap = min_gap
        self.vehicle_length = vehicle_length_m
        self.queue_space = queue_space_m
        self.switch_over = switch_over_s
        self.lambda_a = lambda_a_per_s
        self.lambda_b = lambda_b_per_s
        self.warmup = warmup_s

        # event queue
        self.events: List[Event] = []
        self.t = 0.0
        self.next_vehicle_id = 1

        # queues per segment entrance
        self.queue_at_entry = {seg["id"]: {"A": [], "B": []} for seg in self.segments}

        # one-way state: current_dir, num_on_seg, last_busy_change
        self.oneway_state = {}
        for seg in self.segments:
            if seg["type"] == "one-way":
                self.oneway_state[seg["id"]] = {
                    "current_dir": None,
                    "num_on_seg": 0,
                    "last_busy_change": 0.0,
                }

        # two-way occupancy counts
        self.twoway_on_seg = {seg["id"]: 0 for seg in self.segments if seg["type"] == "two-way"}

        # stats
        self.arrivals_count = {"A": 0, "B": 0}
        self.arrival_times = {"A": [], "B": []}
        self.waits = {"A": [], "B": []}
        self.served = {"A": 0, "B": 0}

        # queue-length samples for one-way segments (time series)
        self.ql_samples = {}
        for seg in self.segments:
            if seg["type"] == "one-way":
                self.ql_samples[seg["id"]] = {"A": [(0.0, 0)], "B": [(0.0, 0)]}

        # movement records for replay: list of dicts with seg_index, seg_id, dir, enter_t, clear_t
        self.movements: List[Dict] = []

    def exp_draw(self, rate_per_s):
        if rate_per_s <= 0:
            return math.inf
        return random.expovariate(rate_per_s)

    def schedule(self, t: float, kind: int, payload: dict = None):
        if payload is None:
            payload = {}
        heapq.heappush(self.events, Event(t, kind, payload))

    def travel_time(self, seg_len_m: float) -> float:
        return seg_len_m / max(1e-9, self.speed)

    def init(self):
        self.schedule(self.t + self.exp_draw(self.lambda_a), ARRIVAL_A)
        self.schedule(self.t + self.exp_draw(self.lambda_b), ARRIVAL_B)

    def sample_queue(self, seg_id: int):
        if seg_id not in self.ql_samples:
            return
        t = self.t
        qA = len(self.queue_at_entry[seg_id]["A"])
        qB = len(self.queue_at_entry[seg_id]["B"])
        if self.ql_samples[seg_id]["A"] and self.ql_samples[seg_id]["A"][-1][1] == qA:
            pass
        else:
            self.ql_samples[seg_id]["A"].append((t, qA))
        if self.ql_samples[seg_id]["B"] and self.ql_samples[seg_id]["B"][-1][1] == qB:
            pass
        else:
            self.ql_samples[seg_id]["B"].append((t, qB))

    def try_start_green(self, seg):
        sid = seg["id"]
        state = self.oneway_state[sid]
        if state["current_dir"] is not None:
            return
        if state["num_on_seg"] > 0:
            return
        QA = self.queue_at_entry[sid]["A"]
        QB = self.queue_at_entry[sid]["B"]
        if not QA and not QB:
            return
        headA = QA[0]["enqueue_time"] if QA else math.inf
        headB = QB[0]["enqueue_time"] if QB else math.inf
        direction = "A" if headA <= headB else "B"
        state["current_dir"] = direction
        self.schedule(self.t, RELEASE, {"seg_id": sid, "dir": direction})
        self.sample_queue(sid)

    def handle_arrival(self, side: str):
        vid = self.next_vehicle_id
        self.next_vehicle_id += 1
        direction = "A" if side == "A" else "B"
        veh = {
            "id": vid,
            "dir": direction,
            "seg_index": 0 if direction == "A" else len(self.segments) - 1,
            "enqueue_time": self.t
        }
        first_seg_id = self.segments[0]["id"] if side == "A" else self.segments[-1]["id"]
        qside = "A" if side == "A" else "B"
        self.queue_at_entry[first_seg_id][qside].append(veh)
        self.arrivals_count[side] += 1
        self.arrival_times[side].append(self.t)
        if self.segments[0]["type"] == "one-way" and side == "A":
            self.sample_queue(self.segments[0]["id"])
        if self.segments[-1]["type"] == "one-way" and side == "B":
            self.sample_queue(self.segments[-1]["id"])
        # schedule next arrival
        if side == "A":
            self.schedule(self.t + self.exp_draw(self.lambda_a), ARRIVAL_A)
        else:
            self.schedule(self.t + self.exp_draw(self.lambda_b), ARRIVAL_B)
        # try start any oneway green
        for seg in self.segments:
            if seg["type"] == "one-way":
                self.try_start_green(seg)

    def handle_release(self, seg_id: int, dir: str):
        seg = next(s for s in self.segments if s["id"] == seg_id)
        state = self.oneway_state[seg_id]
        if state["current_dir"] != dir:
            return
        Q = self.queue_at_entry[seg_id][dir]
        if not Q:
            return
        veh = Q.pop(0)
        wait_time = max(0.0, self.t - veh["enqueue_time"])
        if self.t >= self.warmup:
            if dir == "A":
                self.waits["A"].append(wait_time)
            else:
                self.waits["B"].append(wait_time)
        self.served["A" if dir == "A" else "B"] += 1
        state["num_on_seg"] += 1
        if state["num_on_seg"] == 1:
            state["last_busy_change"] = self.t
        clear_t = self.t + self.travel_time(seg["length"])
        # record movement for replay (seg index)
        seg_index = next(i for i, s in enumerate(self.segments) if s["id"] == seg_id)
        mov = {
            "veh_id": veh["id"],
            "seg_index": seg_index,
            "seg_id": seg_id,
            "dir": dir,
            "enter_t": self.t,
            "clear_t": clear_t,
            "seg_length": seg["length"]
        }
        self.movements.append(mov)
        self.schedule(clear_t, CLEAR, {"seg_id": seg_id, "dir": dir, "veh": veh})
        self.sample_queue(seg_id)
        # next release after min_gap if queue remains
        if Q:
            next_release_t = self.t + self.min_gap
            if next_release_t <= self.sim_duration:
                self.schedule(next_release_t, RELEASE, {"seg_id": seg_id, "dir": dir})

    def handle_clear(self, seg_id: int, dir: str, veh: dict):
        seg_index = next(i for i, s in enumerate(self.segments) if s["id"] == seg_id)
        seg = self.segments[seg_index]
        if seg["type"] == "one-way":
            state = self.oneway_state[seg_id]
            state["num_on_seg"] -= 1
            if state["num_on_seg"] == 0:
                self.schedule(self.t + self.switch_over, GREEN_CHECK, {"seg_id": seg_id})
        else:
            self.twoway_on_seg[seg_id] = max(0, self.twoway_on_seg.get(seg_id, 0) - 1)

        # move to next segment or leave
        if veh["dir"] == "A":
            next_index = seg_index + 1
            approach_side = "A"
        else:
            next_index = seg_index - 1
            approach_side = "B"

        if next_index < 0 or next_index >= len(self.segments):
            return

        next_seg = self.segments[next_index]
        next_seg_id = next_seg["id"]
        veh["enqueue_time"] = self.t
        veh["seg_index"] = next_index
        self.queue_at_entry[next_seg_id][approach_side].append(veh)
        if next_seg["type"] == "one-way":
            self.sample_queue(next_seg_id)
            self.try_start_green(next_seg)
        else:
            q = self.queue_at_entry[next_seg_id][approach_side]
            if q and q[0] is veh:
                q.pop(0)
                self.twoway_on_seg[next_seg_id] = self.twoway_on_seg.get(next_seg_id, 0) + 1
                clear_t = self.t + self.travel_time(next_seg["length"])
                seg_index_n = next_index
                mov = {
                    "veh_id": veh["id"],
                    "seg_index": seg_index_n,
                    "seg_id": next_seg_id,
                    "dir": approach_side,
                    "enter_t": self.t,
                    "clear_t": clear_t,
                    "seg_length": next_seg["length"]
                }
                self.movements.append(mov)
                self.schedule(clear_t, CLEAR, {"seg_id": next_seg_id, "dir": approach_side, "veh": veh})

    def handle_green_check(self, seg_id: int):
        seg = next(s for s in self.segments if s["id"] == seg_id)
        state = self.oneway_state[seg_id]
        if state["num_on_seg"] > 0:
            return
        QA = self.queue_at_entry[seg_id]["A"]
        QB = self.queue_at_entry[seg_id]["B"]
        if not QA and not QB:
            state["current_dir"] = None
            return
        headA = QA[0]["enqueue_time"] if QA else math.inf
        headB = QB[0]["enqueue_time"] if QB else math.inf
        direction = "A" if headA <= headB else "B"
        state["current_dir"] = direction
        self.schedule(self.t, RELEASE, {"seg_id": seg_id, "dir": direction})
        self.sample_queue(seg_id)

    def finalize_ql_samples(self):
        for sid, sides in self.ql_samples.items():
            for side_key in ("A", "B"):
                lst = sides[side_key]
                if not lst:
                    lst.append((0.0, 0))
                last_time, last_val = lst[-1]
                if last_time < self.sim_duration:
                    lst.append((self.sim_duration, last_val))

    def time_weighted_histogram(self, samples: List[Tuple[float, int]]) -> Dict[int, float]:
        times = {}
        for i in range(len(samples) - 1):
            t0, q0 = samples[i]
            t1, _ = samples[i + 1]
            dt = max(0.0, t1 - t0)
            times[q0] = times.get(q0, 0.0) + dt
        return times

    def compute_percentiles_from_hist(self, hist_time: Dict[int, float], pct_list=(50, 90, 95, 99)):
        total_time = sum(hist_time.values())
        if total_time <= 0:
            return {p: None for p in pct_list}
        items = sorted(hist_time.items(), key=lambda x: x[0])
        cumsum = 0.0
        percentiles = {}
        targets = {p: p / 100.0 * total_time for p in pct_list}
        for val, tval in items:
            cumsum += tval
            for p in pct_list:
                if p not in percentiles and cumsum >= targets[p]:
                    percentiles[p] = val
        max_val = max(hist_time.keys()) if hist_time else 0
        for p in pct_list:
            if p not in percentiles:
                percentiles[p] = max_val
        return percentiles

    def run(self):
        self.init()
        while self.events:
            ev = heapq.heappop(self.events)
            if ev.t > self.sim_duration:
                break
            self.t = ev.t
            if ev.kind == ARRIVAL_A:
                self.handle_arrival("A")
            elif ev.kind == ARRIVAL_B:
                self.handle_arrival("B")
            elif ev.kind == RELEASE:
                self.handle_release(ev.payload["seg_id"], ev.payload["dir"])
            elif ev.kind == CLEAR:
                self.handle_clear(ev.payload["seg_id"], ev.payload["dir"], ev.payload.get("veh"))
            elif ev.kind == GREEN_CHECK:
                self.handle_green_check(ev.payload["seg_id"])

        self.finalize_ql_samples()

        hours = self.sim_duration / 3600.0
        arr_rate_A = len(self.arrival_times["A"]) / max(1e-9, hours)
        arr_rate_B = len(self.arrival_times["B"]) / max(1e-9, hours)

        one_way_stats = {}
        for seg in self.segments:
            if seg["type"] != "one-way":
                continue
            sid = seg["id"]
            sides = self.ql_samples[sid]
            stats_sides = {}
            for side_key in ("A", "B"):
                samples = sides[side_key]
                hist_time = self.time_weighted_histogram(samples)
                percentiles = self.compute_percentiles_from_hist(hist_time)
                stats_sides[side_key] = {
                    "hist_time": hist_time,
                    "percentiles": percentiles
                }
            one_way_stats[sid] = stats_sides

        return {
            "arrival_rate_per_hr": {"A->B": arr_rate_A, "B->A": arr_rate_B},
            "one_way_segment_stats": one_way_stats,
            "served": self.served,
            "waits_summary": {
                "A": {"n": len(self.waits["A"]), "avg_s": float(np.mean(self.waits["A"])) if self.waits["A"] else None},
                "B": {"n": len(self.waits["B"]), "avg_s": float(np.mean(self.waits["B"])) if self.waits["B"] else None}
            },
            "movements": self.movements,
            "ql_samples": self.ql_samples,
        }

# ---------------- CLI / Defaults ----------------
def get_cli_parameters():
    ans = input("Use default values for all? (y/n): ").strip().lower()
    if ans in ("y", "yes"):
        speed_kmh = 20.0
        sim_hr = 1000.0
        min_gap = 0.0
        veh_len = 4.5
        queue_space = 6.5
        switch_over = 1
        segments = [{"id": 1, "type": "one-way", "length": 30.0}]
        lambda_a_vph = 60.0
        lambda_b_vph = 60.0
        print("Using default parameter set.")
    else:
        speed_kmh = float(input("Speed (km/h): ").strip())
        sim_hr = float(input("Simulation duration (hours): ").strip())
        min_gap = float(input("Minimum gap between same-direction vehicles (sec): ").strip())
        veh_len = float(input("Vehicle length (m): ").strip())
        queue_space = float(input("Queue space per vehicle (m): ").strip())
        switch_over = float(input("Switch-over (all-clear) time for one-way (sec): ").strip())
        print("Now configure segments (press ENTER to stop; 'delete' to remove last).")
        segments = configure_segments_cli()
        lambda_a_vph = float(input("Arrival rate A->B (veh/hour): ").strip())
        lambda_b_vph = float(input("Arrival rate B->A (veh/hour): ").strip())

    params = {
        "speed_mps": speed_kmh / 3.6,
        "sim_duration_s": sim_hr * 3600.0,
        "min_gap": min_gap,
        "vehicle_length_m": veh_len,
        "queue_space_m": queue_space,
        "switch_over_s": switch_over,
        "segments": segments,
        "lambda_a_per_s": lambda_a_vph / 3600.0,
        "lambda_b_per_s": lambda_b_vph / 3600.0,
    }
    return params

# ---------------- Replay / Visualization ----------------
def build_segment_char_array(segments, scale_m_per_char=5.0):
    """Return list of (seg_chars, seg_type, seg_id) for each segment in order."""
    seg_info = []
    for seg in segments:
        chars = max(1, int(math.ceil(seg["length"] / scale_m_per_char)))
        seg_info.append({"chars": chars, "type": seg["type"], "id": seg["id"], "length": seg["length"]})
    return seg_info

def get_queue_length_at_time(samples: List[Tuple[float,int]], t: float) -> int:
    """Given sample list [(time, q)] (non-decreasing), return q at time t."""
    # binary search for last sample time <= t
    lo = 0
    hi = len(samples) - 1
    ans = samples[0][1]
    while lo <= hi:
        mid = (lo + hi) // 2
        if samples[mid][0] <= t:
            ans = samples[mid][1]
            lo = mid + 1
        else:
            hi = mid - 1
    return ans

def gather_active_intervals(movements: List[Dict], ql_samples: Dict[int, Dict[str, List[Tuple[float,int]]]], sim_end: float):
    """Return merged list of (t0,t1) intervals where activity exists (vehicle on road or qlen>0)."""
    intervals = []
    # vehicle movement intervals
    for m in movements:
        t0 = m["enter_t"]
        t1 = m["clear_t"]
        intervals.append((t0, t1))
    # queue sample intervals where q>0
    for sid, sides in ql_samples.items():
        for side_key in ("A","B"):
            samples = sides[side_key]
            for i in range(len(samples)-1):
                t0, q0 = samples[i]
                t1, _ = samples[i+1]
                if q0 > 0:
                    intervals.append((t0, t1))
    if not intervals:
        return []
    # merge intervals
    intervals.sort(key=lambda x: x[0])
    merged = []
    cur0, cur1 = intervals[0]
    for a,b in intervals[1:]:
        if a <= cur1 + 1e-9:
            cur1 = max(cur1, b)
        else:
            merged.append((cur0, cur1))
            cur0, cur1 = a, b
    merged.append((cur0, cur1))
    # clip to sim bounds and ignore extremely short intervals < 0.5s
    final = []
    for a,b in merged:
        A = max(0.0, a)
        B = min(sim_end, b)
        if B - A >= 0.5:
            final.append((A,B))
    return final

def clear_terminal():
    if os.name == 'nt':
        os.system('cls')
    else:
        os.system('clear')

def render_frame(t, seg_info, movements, ql_samples, scale_m_per_char=5.0):
    """Return string for the frame at time t."""
    # build empty road char array per segment
    road_segments = []
    for s in seg_info:
        if s["type"] == "one-way":
            body = ['_' for _ in range(s["chars"])]
            road_segments.append(('|' + ''.join(body) + '|', s["chars"]))
        else:
            body = ['_' for _ in range(s["chars"])]
            road_segments.append((' ' + ''.join(body) + ' ', s["chars"]))

    # place vehicles according to movements active at time t
    for m in movements:
        if not (m["enter_t"] <= t < m["clear_t"]):
            continue
        seg_index = m["seg_index"]
        seg = seg_info[seg_index]
        seg_chars = seg["chars"]

        # fractional position within segment
        frac = (t - m["enter_t"]) / max(1e-9, (m["clear_t"] - m["enter_t"]))
        frac = min(max(frac, 0.0), 1.0 - 1e-9)

        if m["dir"] == "A":  # A->B (left to right)
            pos_idx = int(frac * seg_chars)
            symbol = "A"
        else:                # B->A (right to left)
            pos_idx = seg_chars - 1 - int(frac * seg_chars)
            symbol = "B"

        # map into string: handle one-way '|' borders
        seg_str, _ = road_segments[seg_index]
        if seg["type"] == "one-way":
            insert_at = 1 + pos_idx  # after leading '|'
        else:
            insert_at = 1 + pos_idx
        lst = list(seg_str)
        lst[insert_at] = symbol     # <-- use A or B here
        road_segments[seg_index] = (''.join(lst), seg_chars)

    # assemble road string
    road_str = ' '.join([s[0] for s in road_segments])

    # build queues (left A side: first seg entrance; right B side: last seg entrance)
    left_q = 0
    right_q = 0
    if seg_info:
        first_id = seg_info[0]['id']
        last_id = seg_info[-1]['id']
        left_q = get_queue_length_at_time(ql_samples.get(first_id, {}).get('A', [(0,0)]), t)
        right_q = get_queue_length_at_time(ql_samples.get(last_id, {}).get('B', [(0,0)]), t)

    # show [A] or [B] in queues instead of [C]
    left_q_str = ''.join(['[A]' for _ in range(min(left_q, 20))]) + ('...' if left_q > 20 else '')
    right_q_str = ''.join(['[B]' for _ in range(min(right_q, 20))]) + ('...' if right_q > 20 else '')

    # build final frame text
    lines = []
    lines.append(f"t = {t:.0f}s")
    lines.append(f"Queue A: {left_q_str}")
    lines.append(f"Road:    {road_str}")
    lines.append(f"Queue B: {right_q_str}")
    return '\n'.join(lines)

# ---------------- Main ----------------
def main():
    params = get_cli_parameters()
    if not params["segments"]:
        print("No segments defined. Exiting.")
        sys.exit(0)

    sim = RoadDES(
        segments=params["segments"],
        speed_mps=params["speed_mps"],
        sim_duration_s=params["sim_duration_s"],
        min_gap=params["min_gap"],
        vehicle_length_m=params["vehicle_length_m"],
        queue_space_m=params["queue_space_m"],
        switch_over_s=params["switch_over_s"],
        lambda_a_per_s=params["lambda_a_per_s"],
        lambda_b_per_s=params["lambda_b_per_s"],
        warmup_s=0.0,
        seed=7
    )
    result = sim.run()

    # Print final summary
    print("\n=== Simulation summary ===")
    print(f"Sim duration (hours): {params['sim_duration_s']/3600.0:.2f}")
    print("Arrival rates (veh/hour):")
    print(f"  A -> B: {result['arrival_rate_per_hr']['A->B']:.2f}")
    print(f"  B -> A: {result['arrival_rate_per_hr']['B->A']:.2f}")
    print("\nServed vehicles (counts):", result["served"])
    print("\nAverage waits (s):")
    wa = result["waits_summary"]["A"]["avg_s"]
    wb = result["waits_summary"]["B"]["avg_s"]
    if wa is not None:
        print(f"  A->B: n={result['waits_summary']['A']['n']}, avg={wa:.3f}")
    else:
        print("  A->B: no samples")
    if wb is not None:
        print(f"  B->A: n={result['waits_summary']['B']['n']}, avg={wb:.3f}")
    else:
        print("  B->A: no samples")

    print("\nOne-way segment queue-time histograms and percentiles (time-weighted):")
    for seg in params["segments"]:
        if seg["type"] != "one-way":
            continue
        sid = seg["id"]
        stats = result["one_way_segment_stats"].get(sid, {})
        print(f"\nSegment {sid} (length {seg['length']} m):")
        for side_label, side_key in (("Upstream (A side)", "A"), ("Upstream (B side)", "B")):
            side_stats = stats.get(side_key, {})
            hist_time = side_stats.get("hist_time", {})
            pct = side_stats.get("percentiles", {})
            print(f"  {side_label}:")
            if not hist_time:
                print("    No time recorded (no queue).")
                continue
            sorted_q = sorted(hist_time.items(), key=lambda x: x[0])
            print("    Queue length (veh) : time spent (s) [percent of sim]")
            for qlen, tval in sorted_q:
                pct_sim = 100.0 * tval / max(1e-9, params["sim_duration_s"])
                print(f"      {qlen:3d} : {tval:8.1f} s ({pct_sim:5.2f}%)")
            if pct:
                print("    Percentiles (time-weighted):")
                for p in (50, 90, 95, 99):
                    print(f"      p{p}: {pct.get(p)} vehicles")
            else:
                print("    No percentile data.")

    # Prepare for replay
    movements = result["movements"]
    ql_samples = result["ql_samples"]
    sim_end = params["sim_duration_s"]
    seg_info = build_segment_char_array(params["segments"], scale_m_per_char=5.0)

    active_intervals = gather_active_intervals(movements, ql_samples, sim_end)
    if not active_intervals:
        print("\nNo activity to replay (no vehicles or queues during sim).")
        return

    print("\nStarting replay (1x real time) — only active intervals will be played.")
    time.sleep(5)

    # For each active interval, play from ceil(start) to floor(end) at 1s per frame
    for (a,b) in active_intervals:
        t0 = int(math.floor(a))
        t1 = int(math.ceil(b))
        # advance to t0 instantly (we don't wait for idle gaps)
        for t in range(t0, t1 + 1):
            # show frame only if there is activity at exact second t (vehicles or queue)
            # check if any movement covers t or any queue > 0 at t
            has_activity = False
            # movements
            for m in movements:
                if m["enter_t"] <= t < m["clear_t"]:
                    has_activity = True
                    break
            if not has_activity:
                # check queue samples at first and last segment
                if seg_info:
                    first_id = seg_info[0]['id']
                    last_id = seg_info[-1]['id']
                    qA = get_queue_length_at_time(ql_samples.get(first_id, {}).get('A', [(0,0)]), t)
                    qB = get_queue_length_at_time(ql_samples.get(last_id, {}).get('B', [(0,0)]), t)
                    if qA > 0 or qB > 0:
                        has_activity = True
            if not has_activity:
                continue
            # render and display
            frame = render_frame(t, seg_info, movements, ql_samples, scale_m_per_char=5.0)
            clear_terminal()
            print(frame)
            # wait real time for next second
            time.sleep(0.3)

    print("\nReplay finished.")

if __name__ == "__main__":
    main()
