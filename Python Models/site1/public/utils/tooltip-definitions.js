/**
 * Tooltip Definitions
 * Centralised location for all tooltip text across simulator and tool pages
 *
 * Usage: Add or edit definitions here. The key is matched against data-tooltip attributes.
 * Format: 'key': 'Tooltip text that will appear on hover'
 */

const TOOLTIP_DEFINITIONS = {
    // ========== COMMON SIMULATION PARAMETERS ==========
    'arrival-rate': 'The average number of vehicles arriving to the system per hour. Can also be arrivals to the back of queue for queueing scenarios.',

    'average-service-time': 'Mean time (in seconds) required to serve/process one vehicle.',

    'confidence-level': 'The statistical confidence that simulation results fall within the specified margin of error. Higher confidence levels require more simulation runs (seeds).',

    'estimated-runtime': 'Approximate time for the simulation to complete based on current parameters. Actual time may vary depending on server load.',

    'margin-error': 'The accepter range of uncertainty in simulation results, typically expressed as ± percentage. Smaller margins require more simulation runs for statistical validity.',

    'num-seeds': 'A seed determines the initialises the algorithm for computer based random number generation. Each seeds produces a different random pattern of arrivals for poisson simulations.',

    'seed-mode': 'Fixed seeds ensure reproducible results (same inputs = same outputs). Random seeds use different random sequences each time.',

    'simulation-hours': 'The length of time to analyse the system for each simulation run (seed).',

    // ========== QUEUE ANALYSIS ==========
    'cars-blocked': 'The percentage of vehicles which arrive to the system or back of queue when there is insufficient queueing capacity. That vehicle is then blocked from both queueing and being serviced. Those vehicles are not included in queueing statistics.',

    'cars-queued': 'Total number of vehicles that experienced a delay (had to wait in queue).',

    'hourly-maximum': 'Distribution showing the maximum queue length observed in each hour of simulation.',

    'hours': 'The percentage of discrete hours in which this is the highest observation. This is found be checking each hour individually, rather than averaging the whole simulation time.',

    'hours-max-cumulative': 'Cumulative percentage showing the proportion of hours where the maximum was at or below this length.',

    'percent-hours': 'Percentage of hourly observations where the maximum reached this length at least once during that hour.',

    'percent-time': 'Percentage of total simulation time that the queue was at this specific length.',

    'probability-queuing': 'The probability that an arriving vehicle will have to wait in queue at all, rather than being served immediately.',

    'queue-length': 'The number of vehicles waiting in line at any given time.',

    'time': 'Percentage of total simulation time that the queue was at this specific length.',

    'time-cumulative': 'Cumulative percentage showing the total time the queue was at or below this length.',

    'wait-per-arrival': 'The average time a vehicle spends waiting in queue before being served, calculated per arrival (including those who don\'t wait).',

    'wait-per-queued': 'The average time a vehicle spends waiting in queue before being served, calculated per queued vehicle only (excludes those with immediate service).',

    // ========== TWO-WAY PASSING SIMULATOR ==========
    'avg-delay-per-vehicle': 'Mean delay time across all vehicles, including those with zero delay.',

    'delay-probability': 'The probability that an arriving vehicle will have to wait in queue at all, rather than being served immediately.',

    'immediate-entry': 'Vehicles that entered the segment without any delay (segment was available).',

    'min-followup': 'The minimum time interval between consecutive vehicle servicing from the same direction, even when coming from the same queue. If follow-up time is less than the service time then vehicles from the same direction can be serviced at the same time. If follow-up time is greater than or equal to service time then vehicles from the same direction will be serviced one at a time.',

    'min-gap': 'The minimum time interval between consecutive vehicle arrivals from the same direction, also called \'headway\'.',

    'queue-a-rate': 'Arrival rate for vehicles approaching from direction A, measured in vehicles per hour.',

    'queue-b-rate': 'Arrival rate for vehicles approaching from direction B, measured in vehicles per hour.',

    'queued-opposite-busy': 'Vehicles that had to wait because a vehicle from the opposite direction was using the segment.',

    'queued-same-busy': 'Vehicles that had to wait because another vehicle from their direction was using the segment.',

    'service-time': 'The time required to process or serve one vehicle at a control point. Can be fixed (deterministic) or follow a statistical distribution (e.g., exponential) to model variability. The service time includes the full time from entry to the system until exit and can include searching for parking space, parking manoeuvre, parking time, payment of a parking fee and operation of mechanical parking system, but does not include any time in queue.',

    'service-time-mode': 'Choose how service time is provided: Fixed (constant value) or calculated from Distance + Speed.',

    // ========== PRIORITY MODES ==========
    'entry-priority': 'Vehicles entering the facility are given priority over vehicles attempting to exit.',

    'exit-priority': 'Vehicles exiting the facility are given priority over vehicles attempting to enter.',

    'fcfs': 'First Come First Served - A servicing model where vehicles are served in the order they arrive to the \'back\' of any queue, regardless of their origin or destination. This combines multiple queues into a single theoretical arrival queue where whoever has waited longest will go next. In practice this implies uniform patience of drivers and \'giving way\' to other queued vehicles which may have arrived earlier from other directions.',

    'priority-mode': 'Determines which queue gets preference when both directions have waiting vehicles.',

    // ========== BOOMGATE SIMULATOR ==========
    'boomgate-variability': 'Toggle for whether time for this action is variable or fixed in duration.',

    'min-headway': 'The minimum time interval between consecutive vehicle arrivals to the back of queue.',

    'movement-time': 'The total time for boom gate opening, car passing out of detection range, boom gate closing, next car to stop point.',

    'ticket-operations': ' Time taken for ticket insertion, payment, processing and error handling.',

    // ========== CAR PARK UTILISATION ==========
    'actual-utilisation': 'Percentage of time that the modelled vehicles were actually occupying the available capaicty during the simulation.',

    'blocking-model': 'Vehicles are turned away (blocked) if the system is full. No queue forms.',

    'erlang-b': 'Erlang-B blocking probability model. Calculates the likelihood that all spaces are occupied (no queueing allowed).',

    'exponential-service': 'A method to transform a random variable into a continuous distribution for a poisson event. This provides interarrival times that are exponentially distributed.',

    'infinite-capacity': 'Model assumes unlimited queue space - vehicles can always wait if no space is available.',

    'mm-c-analysis': 'M/M/c queueing model analysis. Assumes exponential interarrival times, exponential service times, and c servers (parking spaces).',

    'queueing-model': 'Vehicles form a queue when system is full and wait for a space to become available.',

    'theoretical-min-spaces': 'Calculated minimum parking spaces needed based on average duration and arrival rate, assuming perfect arrival and patterns.',

    // ========== CAR LIFT SIMULATOR ==========
    'avg-trip-time': 'Average total time (in seconds) from arrival at lobby to reaching destination floor.',

    'cars-per-hour': 'The number of vehicles the lift can serve per hour.',

    'door-closing': 'The time for lift or mechanical system doors to fully close.',

    'door-opening': 'The time for lift or mechanical system doors to fully open.',

    'entering-lift': 'The time required for a vehicle to enter a lift platform, parking space, or service area. Includes driver reaction time and movement until the next lift action can occur, being either the lift mechanism or another vehicle commencing entry.',

    'exiting-lift': 'The time required for a vehicle to exit a lift platform, parking space, or service area. Includes driver reaction time and movement until the next action can occur.',

    'floor-to-floor': 'The time required to travel between adjacent floors in a lift or elevator system, including acceleration, travel, and deceleration phases.',

    'l2-arrivals': 'Arrival rate for vehicles at the second level/floor (if applicable).',

    'leveling-buffer': 'Time between end of doors closing and start of lift movement and between end of lift movement and start of doors opening. Allows for lift to properly align with floor level. Applied twice per lift movement.',

    'lobby-floor': 'Floor where the lift starts and where most arrivals occur. The lift system also returns the lift to this floor when idle.',

    'min-arrival-headway': 'The minimum time interval between consecutive vehicle arrivals to the back of queue.',

    // ========== SYSTEM ANALYSIS ==========
    'cars-in-system': 'Average number of vehicles in the entire system (both waiting in queue and being served).',

    'discrete-event-simulation': 'Simulation technique that models the system as a sequence of events occurring at specific points in time.',

    'service-variability': 'Service time range within one standard deviation (±1σ). Covers approximately 68% of all service times.',

    // ========== TOOL-SPECIFIC TERMS ==========
    'above-road': 'Vertically offset segment above the road surface for things at kerb height.',

    'exit-headway-mode': 'Time spacing between vehicles exiting the facility.',

    'parent-zone': 'The zone or area that contains this element.',

    'rl-chainage': 'The cumulative longitudinal distance along a roadway or ramp from a reference starting point. Used to locate specific points along the alignment. Often prefixed with \'CH\', \'CL\', or \'ST\'.',

    'setback': 'Horizontal distance from the property boundary to the facade of a building.',

    'up-direction': 'Arrow indicating the higher side of the segment.',

    // ========== ADDITIONAL TERMS ==========

    'blocking-probability': 'The percentage of arriving vehicles which arrive to the system and there is insufficient queueing capacity. That vehicle is then blocked from both queueing and being serviced.',

    'interarrival-time': 'Time between consecutive arrivals. Inverse of arrival rate.',

    'throughput': 'System throughput - number of vehicles successfully processed per unit time. Often expressed in vehicles per hour.',

    'utilisation': 'The percentage of time that a system or facility is actively serving vehicles or is occupied compared to the maximum theoretical capacity.',

    'utilisation-rate': 'The percentage of time that a system or facility is actively serving vehicles or is occupied compared to the maximum theoretical capacity.',

    'warmup-period': 'Initial simulation time that is excluded from results to allow the system to reach steady-state conditions. Simulations provided assume zero usage at time = 0 which may be an unlikely scenario, though for low simulation durations, warm-up time being excluded from statistics would reliably counteract any accuracy impact.',

    // ========== RESULT METRICS ==========
    'avg-service-time': 'Mean time (in seconds) required to serve/process one vehicle or customer.',

    'cars': 'Number of vehicles in the system or queue.',

    'cars-in-system': 'Number of vehicles currently in the system (includes both those waiting and being served).',

    'cumulative': 'Running total or sum up to and including this point. Shows percentage of time less than or equal to this value.',

    'hourly-max-distribution': 'Distribution showing the maximum queue length observed in each discrete hour.',

    'max-hour': 'Maximum value observed in each discrete hour of simulation.',

    'maxhour': 'Maximum value observed in each discrete hour of simulation.',

    'metric': 'Measurement or statistic calculated from simulation results.',

    'probability-of-queuing': 'The probability that an arriving vehicle will have to wait in queue at all, rather than being served immediately.',

    'queue-distribution': 'Statistical breakdown showing how often the queue was at each length.',

    'service-1σ': 'Service time range within one standard deviation (±1σ). Covers approximately 68% of all service times.',

    'service-variability': 'Service time range within one standard deviation (±1σ). Covers approximately 68% of all service times.',

    'total-arrivals': 'Total number of vehicles/customers that arrived during the simulation period.',

    'value': 'Numerical result for the corresponding metric.'
};

// Make available globally
if (typeof window !== 'undefined') {
    window.TOOLTIP_DEFINITIONS = TOOLTIP_DEFINITIONS;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOOLTIP_DEFINITIONS;
}
