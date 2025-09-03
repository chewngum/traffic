import heapq, random, collections

# ===== USER INPUT =====
def get_int(prompt, default, min_val=None, max_val=None):
    val = input(f"{prompt} [default={default}]: ")
    num = default if val.strip() == "" else int(val)
    if min_val is not None and num < min_val:
        raise ValueError(f"Value must be ≥ {min_val}")
    if max_val is not None and num > max_val:
        raise ValueError(f"Value must be ≤ {max_val}")
    return num

def get_float(prompt, default):
    val = input(f"{prompt} [default={default}]: ")
    return default if val.strip() == "" else float(val)

num_floors = get_int("Number of floors (≤10)", default=2, min_val=1, max_val=10)
lobby_floor = get_int(f"Lobby floor (0 to {num_floors-1})", default=0, min_val=0, max_val=num_floors-1)

door_open_time = get_float("Door opening time (s)", default=0.0)
enter_time = get_float("Entering time (s)", default=0.0)
door_close_time = get_float("Door closing time (s)", default=0.0)
selection_time = get_float("Selection time (s)", default=5.4)
vertical_speed = get_float("Time per floor travel (s)", default=0.0)
exit_time = get_float("Exiting time (s)", default=0.0)
buffer_time = get_float("Levelling buffer time (s)", default=0.0)

arrival_rates = []
departure_rates = []
for f in range(num_floors):
    if f == lobby_floor:
        r = get_float(f"Arrivals per hour at lobby floor {f}: ", default=15.0)
        departure_rates.append(r)
        arrival_rates.append(0.0)
    else:
        r = get_float(f"Departures per hour at floor {f}: ", default=15.0)
        arrival_rates.append(r)
        departure_rates.append(0.0)

sim_hours = get_float("Simulation duration (hours): ", default=1000)

# ===== DATA STRUCTURES =====
class Passenger:
    def __init__(self, origin, dest, arrival_time):
        self.origin = origin
        self.destination = dest
        self.arrival_time = arrival_time
        self.board_time = None
        self.exit_time = None

class Event:
    def __init__(self, time, event_type, passenger=None):
        self.time = time
        self.event_type = event_type
        self.passenger = passenger
    def __lt__(self, other): return self.time < other.time

class Elevator:
    def __init__(self):
        self.current_floor = lobby_floor
        self.passenger = None
        self.doors_open = False
        self.active_time = 0.0
        self.passenger_time = 0.0
        self.busy_until = 0.0
        self.occupied_until = 0.0

# ===== INITIALISE =====
event_queue = []
floor_queues = [[] for _ in range(num_floors)]
served = []
queue_hist = [collections.Counter() for _ in range(num_floors)]
last_time = 0.0
elevator = Elevator()

# ===== UTILS =====
def exp_time(rate_per_hour):
    if rate_per_hour <= 0: return None
    return random.expovariate(rate_per_hour / 3600.0)

def travel_time(f1, f2):
    return abs(f1-f2) * vertical_speed + buffer_time

def schedule_arrivals():
    for f in range(num_floors):
        if departure_rates[f] > 0:
            t = exp_time(departure_rates[f])
            if t: heapq.heappush(event_queue, Event(t, "arrival", Passenger(lobby_floor, f, t)))
        if arrival_rates[f] > 0:
            t = exp_time(arrival_rates[f])
            if t: heapq.heappush(event_queue, Event(t, "arrival", Passenger(f, lobby_floor, t)))

def dispatch(time):
    if elevator.passenger: return

    if floor_queues[elevator.current_floor]:
        p = floor_queues[elevator.current_floor].pop(0)
        p.board_time = time + enter_time
        t_travel = travel_time(elevator.current_floor, p.destination)
        travel_end = time + enter_time + selection_time + door_close_time + t_travel
        exit_end = travel_end + exit_time

        elevator.passenger = p
        elevator.occupied_until = travel_end
        elevator.busy_until = exit_end

        heapq.heappush(event_queue, Event(travel_end, "travel_arrival", p))
        return

    floors = [i for i in range(num_floors) if floor_queues[i]]
    if not floors:
        if elevator.current_floor != lobby_floor:
            t_travel = travel_time(elevator.current_floor, lobby_floor)
            elevator.busy_until = time + t_travel
            elevator.current_floor = lobby_floor
        return

    target = min(floors, key=lambda f: abs(f - elevator.current_floor))
    t_travel = travel_time(elevator.current_floor, target)
    elevator.busy_until = time + t_travel
    elevator.current_floor = target
    heapq.heappush(event_queue, Event(time + t_travel, "floor_arrival"))

# ===== MAIN SIM =====
def run():
    global last_time
    sim_time = sim_hours * 3600.0
    schedule_arrivals()
    time = 0.0

    while event_queue and time <= sim_time:
        evt = heapq.heappop(event_queue)
        time = evt.time

        dt = time - last_time
        if dt > 0:
            passenger_overlap = max(0, min(elevator.occupied_until, time) - last_time)
            active_overlap = max(0, min(max(elevator.busy_until, elevator.occupied_until), time) - last_time)
            elevator.passenger_time += passenger_overlap
            elevator.active_time += active_overlap
        last_time = time

        for f in range(num_floors):
            qlen = len(floor_queues[f])
            queue_hist[f][qlen] += dt

        if evt.event_type == "arrival":
            p = evt.passenger
            floor_queues[p.origin].append(p)
            if p.origin == lobby_floor:
                t = exp_time(departure_rates[lobby_floor])
                if t and time+t <= sim_time:
                    heapq.heappush(event_queue, Event(time+t, "arrival", Passenger(lobby_floor, p.destination, time+t)))
            else:
                t = exp_time(arrival_rates[p.origin])
                if t and time+t <= sim_time:
                    heapq.heappush(event_queue, Event(time+t, "arrival", Passenger(p.origin, lobby_floor, time+t)))
            dispatch(time)

        elif evt.event_type == "floor_arrival":
            dispatch(time)

        elif evt.event_type == "travel_arrival":
            p = evt.passenger
            elevator.current_floor = p.destination
            heapq.heappush(event_queue, Event(time + exit_time, "trip_arrival", p))

        elif evt.event_type == "trip_arrival":
            p = evt.passenger
            p.exit_time = time
            served.append(p)
            elevator.passenger = None
            elevator.occupied_until = 0.0
            elevator.busy_until = time
            dispatch(time)  # <-- immediately pick next passenger

    print("\n=== Simulation Results ===")
    total_time = sim_time
    passenger_util = 100 * elevator.passenger_time / total_time
    active_util = 100 * elevator.active_time / total_time
    idle_util = 100 - active_util

    print(f"Passenger utilisation (time with passenger): {passenger_util:.2f}%")
    print(f"Active utilisation (not idle): {active_util:.2f}%")
    print(f"Idle time: {idle_util:.2f}%")

    wait_by_level = collections.defaultdict(list)
    for p in served:
        wait_by_level[p.origin].append((p.board_time - p.arrival_time) if p.board_time else 0.0)
    for f in range(num_floors):
        waits = wait_by_level[f]
        if waits:
            avg = sum(waits)/len(waits)
            print(f"Avg wait at floor {f}: {avg:.3f}s")

    up_times, down_times = [], []
    for p in served:
        if p.exit_time and p.board_time:
            service = p.exit_time - p.board_time
            if p.destination > p.origin:
                up_times.append(service)
            else:
                down_times.append(service)
    if up_times: print(f"Avg service time UP: {sum(up_times)/len(up_times):.2f}s")
    if down_times: print(f"Avg service time DOWN: {sum(down_times)/len(down_times):.2f}s")

    print("\nQueue length distributions (percentage of time):")
    for f in range(num_floors):
        total = sum(queue_hist[f].values())
        if total == 0: continue
        print(f" Floor {f}:")
        for qlen in sorted(queue_hist[f]):
            pct = 100 * queue_hist[f][qlen] / total
            print(f"   {qlen}: {pct:.2f}%")

if __name__ == "__main__":
    run()
