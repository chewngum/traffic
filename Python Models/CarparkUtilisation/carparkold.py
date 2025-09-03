import random
import itertools
import time
from collections import Counter

arrivalrate = 30       # cars per hour
servicetime = 5.4      # seconds (can be float)
spaces = 1             # number of spaces
precision = 0.1        # time step in seconds (can be float)


def percentage(percent, values):
    """Return index where cumulative percentage exceeds given percent."""
    for index, number in enumerate(values):
        if number >= percent:
            return index
    return len(values) - 1


def modelrun(arrivalrate, servicetime, spaces):
    start_time = time.time()
    count_arrivals = 0
    cyclecount = 1000  # number of simulated hours (can adjust)

    maxlen = int(arrivalrate * servicetime / 600 + 200)
    count_carsparked_q = [0.0] * maxlen
    count_carsqueued = [0.0] * maxlen

    carsparked_q = []   # list of service times left for parked cars
    queue = 0
    carsqueued = 0
    queuetime = 0.0

    percentiles = [10,20,30,40,50,60,70,80,90,95,98,99]

    total_steps = int(cyclecount * 3600 / precision)

    # for tracking max queue length per hour
    max_queue_per_hour = []
    current_hour_max = 0
    current_hour = 0

    # simulate
    for step in range(1, total_steps + 1):
        t = step * precision  # current simulation time (seconds)

        # Count current carpark utilisation
        count_carsparked_q[max(len(carsparked_q)-1,0)] += 1
        count_carsqueued[min(queue, len(count_carsqueued)-1)] += 1
        queuetime += queue * precision

        # track max queue for this hour
        if queue > current_hour_max:
            current_hour_max = queue

        # Update parked cars
        if carsparked_q:
            carsparked_q = [max(0, item - precision) for item in carsparked_q]

            # remove finished cars (first in)
            while carsparked_q and carsparked_q[0] <= 0:
                carsparked_q.pop(0)
                if queue > 0:
                    carsparked_q.append(servicetime)
                    queue -= 1

        # Car arrival process
        prob_arrival = arrivalrate / 3600 * precision
        if random.random() < prob_arrival:  # arrival this step
            count_arrivals += 1
            if len(carsparked_q) < spaces:
                carsparked_q.append(servicetime)
            else:
                queue += 1
                carsqueued += 1

        # check if an hour passed
        if int(t // 3600) > current_hour:
            max_queue_per_hour.append(current_hour_max)
            current_hour = int(t // 3600)
            current_hour_max = queue  # reset for next hour (start with current queue)

    # also append last hour
    if current_hour_max > 0 or len(max_queue_per_hour) < cyclecount:
        max_queue_per_hour.append(current_hour_max)

    # compute percentages
    counts = Counter(max_queue_per_hour)
    total_hours = len(max_queue_per_hour)
    max_observed_queue = max(max_queue_per_hour)

    queue_distribution = {q: round(100*counts.get(q,0)/total_hours,2) for q in range(max_observed_queue+1)}

    # report
    end_time = time.time()
    elapsed_time = end_time - start_time
    print("Model completed in", int(round(elapsed_time,0)), "seconds")
    print("Simulated", total_hours, "hours")

    if count_arrivals > 0:
        print("Cars Queued =", round(carsqueued * 100 / count_arrivals,2), "%")
        print("Average Queue time per Arrival =", round(queuetime / count_arrivals,2), "seconds")
    if carsqueued > 0:
        print("Average Queue time per Queued Vehicle =", round(queuetime / carsqueued,2), "seconds")

    print("\nPercentage of hours with each maximum queue length:")
    for q, pct in queue_distribution.items():
        print(f"Queue {q}: {pct}% of hours")


# run example
modelrun(arrivalrate, servicetime, spaces)
