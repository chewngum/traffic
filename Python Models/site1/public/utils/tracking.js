// tracking.js - Simulation usage tracking

/**
 * Record simulation usage to the backend
 */
async function recordSimulationUsage(simulationType, parameters, startTime, success = true) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            return;
        }

        const runtimeMs = Date.now() - startTime;

        // Get the track-usage endpoint from API_CONFIG
        const apiUrl = window.API_CONFIG?.endpoints?.trackUsage ||
                      'https://4x66k1lppi.execute-api.us-east-1.amazonaws.com/api/track-usage';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                simulationType,
                parameters,
                runtimeMs,
                success,
                timestamp: new Date().toISOString(),
                pageUrl: window.location.href
            })
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        if (data.success) {
            console.log(`✓ Tracked ${simulationType} simulation: ${success ? 'success' : 'failure'}, ${runtimeMs}ms`);
        } else {
        }
    } catch (error) {
    }
}

/**
 * Detect the current simulation type from the URL
 */
function getCurrentSimulationType() {
    const path = window.location.pathname;

    if (path.includes('boomgate')) return 'boomgate';
    if (path.includes('carlift')) return 'carlift';
    if (path.includes('carparkutilisation')) return 'carparkutilisation';
    if (path.includes('mechanical')) return 'mechanical';
    if (path.includes('schoolpickup')) return 'schoolpickup';
    if (path.includes('two-way-passing')) return 'two-way-passing';
    if (path.includes('rampdrawer') || path.includes('ramp-drawer')) return 'rampdrawer';
    if (path.includes('streetsection') || path.includes('street-section')) return 'streetsection';
    if (path.includes('network') || path.includes('traffic-network')) return 'network';

    return null;
}

/**
 * Setup automatic tracking by intercepting fetch calls to simulation APIs
 */
function setupFetchTracking() {
    // Check if already setup to prevent double-wrapping
    if (window._trackingSetup) {
        return;
    }

    // Store reference to original fetch (get the native one before any wrappers)
    const originalFetch = window.fetch;

    // Mark as setup
    window._trackingSetup = true;

    // Override window.fetch with tracking wrapper
    window.fetch = async function(url, options = {}) {
        // Extract URL string (handle both string and Request object)
        const urlString = typeof url === 'string' ? url : url.toString();
        
        // CRITICAL: Never intercept the track-usage endpoint itself (infinite loop!)
        if (urlString.includes('track-usage') || urlString.includes('trackUsage')) {
            return originalFetch.call(this, url, options);
        }

        // List of simulation API endpoints to track
        const simulationAPIs = [
            'boomgate',
            'carlift',
            'carparkutilisation',
            'mechanical',
            'schoolpickup',
            'two-way-passing',
            'rampdrawer',
            'streetsection'
        ];

        // Check if this is a simulation API call
        const isSimulationAPI = urlString.includes('/api/') &&
                               simulationAPIs.some(api => urlString.includes(api));

        // If NOT a simulation API, pass through immediately without tracking
        if (!isSimulationAPI) {
            return originalFetch.call(this, url, options);
        }
        
        // Extract simulation details for tracking
        let simulationType = null;
        let parameters = null;
        let startTime = null;
        
        // Identify which simulation this is (strip -parallel suffix for tracking)
        for (const api of simulationAPIs) {
            if (urlString.includes(api)) {
                simulationType = api;
                break;
            }
        }

        // Handle parallel endpoint variants (they use same tracking names)
        if (!simulationType && urlString.includes('-parallel')) {
            for (const api of simulationAPIs) {
                if (urlString.includes(api + '-parallel')) {
                    simulationType = api;
                    break;
                }
            }
        }
        
        // Extract parameters from POST body if this is a simulation run
        if (options.method === 'POST' && options.body) {
            try {
                const body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                const bodyData = JSON.parse(body);
                
                // Check if this is a simulation action with parameters
                if (bodyData.action && bodyData.parameters) {
                    const isSimulationAction = 
                        bodyData.action.includes('runSimulation') ||
                        bodyData.action.includes('generateDrawings') ||
                        bodyData.action.includes('exportFile') ||
                        bodyData.action.includes('exportAutoCAD');
                    
                    if (isSimulationAction) {
                        parameters = bodyData.parameters;
                        startTime = Date.now();
                    }
                }
            } catch (e) {
            }
        }
        
        // Call the original fetch
        const response = await originalFetch.call(this, url, options);
        
        // Track the result if this was a tracked simulation
        if (simulationType && parameters && startTime) {
            // Clone response to avoid consuming it
            response.clone().json().then(data => {
                const success = data.success === true;
                recordSimulationUsage(simulationType, parameters, startTime, success);
            }).catch(err => {
                // If response parsing fails, record as failure
                recordSimulationUsage(simulationType, parameters, startTime, false);
            });
        }
        
        return response;
    };
    
}

// Export functions for use by other modules
export { recordSimulationUsage, getCurrentSimulationType, setupFetchTracking };