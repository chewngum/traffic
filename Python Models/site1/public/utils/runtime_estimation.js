// runtime-estimation.js - Simulation runtime estimation

function estimateSimulationRuntime(parameters) {
    const currentPath = window.location.pathname;
    let estimatedSeconds = 5;
    
    switch (currentPath) {
        case '/traffic/simulators/carlift/':
            estimatedSeconds = estimateCarLiftRuntime(parameters);
            break;
        case '/traffic/simulators/boomgate/':
            estimatedSeconds = estimateBoomGateRuntime(parameters);
            break;
        case '/traffic/simulators/two-way-passing/':
            estimatedSeconds = estimateTwoWayPassingRuntime(parameters);
            break;
        case '/traffic/simulators/schoolpickup/':
            estimatedSeconds = estimateSchoolPickupRuntime(parameters);
            break;
        case '/traffic/simulators/carparkutilisation/':
            estimatedSeconds = estimateCarParkRuntime(parameters);
            break;
        case '/traffic/simulators/mechanical/':
            estimatedSeconds = estimateMechanicalRuntime(parameters);
            break;
        default:
            estimatedSeconds = 5;
    }
    
    const estimatedMs = Math.max(500, Math.min(300000, estimatedSeconds * 1000));

    return estimatedMs;
}

function estimateCarLiftRuntime(parameters) {
    let totalArrivals = 0;
    for (let f = 1; f <= parameters.numFloors; f++) {
        if (f === parameters.lobbyFloor) continue;
        totalArrivals += (parameters.arrivalRates[f] || 0);
        totalArrivals += (parameters.departureRates[f] || 0);
    }
    
    const estimatedSeconds = (totalArrivals * parameters.simHours * parameters.numSeeds * 0.00000322)+0.4;
    return Math.max(0.8, estimatedSeconds);
}

function estimateBoomGateRuntime(parameters) {
    const arrivalRate = parameters.arrivalRate;
    const simHours = parameters.simulationHours || parameters.simHours;
    const numSeeds = parameters.numSeeds;
    
    const estimatedSeconds = (arrivalRate * simHours * numSeeds * 0.000000205)+0.65;
    return Math.max(1.3, estimatedSeconds);
}

function estimateTwoWayPassingRuntime(parameters) {
    const arrivalRate = parameters.arrivalRate;
    const simHours = parameters.simHours;
    const numSeeds = parameters.numSeeds;
    
    return (arrivalRate * simHours * numSeeds * 0.00000072)+0.35;
}

function estimateSchoolPickupRuntime(parameters) {
    const arrivalRate = parameters.arrivalRate || parameters.peakArrivalRate;
    const simHours = parameters.simHours || parameters.simulationHours;
    const numSeeds = parameters.numSeeds;
    
    const estimatedSeconds = (arrivalRate * simHours * numSeeds * 0.000001) + 0.9;
    return Math.max(0.9, estimatedSeconds);
}

function estimateCarParkRuntime(parameters) {
    const arrivalRate = parameters.arrivalRate;
    const simHours = parameters.simHours;
    const numSeeds = parameters.numSeeds;
    
    const estimatedSeconds = (arrivalRate * simHours * numSeeds * 0.00000135)+1.05;
    return Math.max(0.6, estimatedSeconds);
}

function estimateMechanicalRuntime(parameters) {
    const entryRate = parameters.entryRate;
    const exitRate = parameters.exitRate; 
    const totalRate = entryRate + exitRate;
    const simHours = parameters.simHours || parameters.simulationHours;
    const numSeeds = parameters.numSeeds;
    
    const estimatedSeconds = (totalRate * simHours * numSeeds * 0.00000121)+0.5;
    return Math.max(0.75, estimatedSeconds);
}

function updateRuntimeEstimateDisplay(parameters, estimatedMs = null) {
    const runtimeEstimateDiv = document.getElementById('runtimeEstimate');
    if (!runtimeEstimateDiv) return;
    
    try {
        const timeMs = estimatedMs || estimateSimulationRuntime(parameters);
        const timeStr = formatEstimatedTime(timeMs);
        runtimeEstimateDiv.textContent = timeStr;
        runtimeEstimateDiv.style.color = timeMs > 30000 ? '#d4691e' : '#6b99c2';
    } catch (error) {
        runtimeEstimateDiv.textContent = 'Unable to estimate';
        runtimeEstimateDiv.style.color = '#999';
    }
}

function formatEstimatedTime(ms) {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    return `${(ms/60000).toFixed(1)}m`;
}

export { 
    estimateSimulationRuntime,
    estimateCarLiftRuntime,
    estimateBoomGateRuntime,
    estimateTwoWayPassingRuntime,
    estimateSchoolPickupRuntime,
    estimateCarParkRuntime,
    estimateMechanicalRuntime,
    updateRuntimeEstimateDisplay
};