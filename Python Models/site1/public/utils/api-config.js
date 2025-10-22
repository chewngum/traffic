// API Configuration for Traffic Labb
const API_BASE_URL = 'https://4x66k1lppi.execute-api.us-east-1.amazonaws.com';

// Store the original native fetch before any wrappers
const nativeFetch = window.fetch.bind(window);

window.API_CONFIG = {
    baseUrl: API_BASE_URL,

    endpoints: {
        login: `${API_BASE_URL}/api/login`,
        account: `${API_BASE_URL}/api/account`,
        trackUsage: `${API_BASE_URL}/api/track-usage`,
        'track-usage': `${API_BASE_URL}/api/track-usage`,
        boomgate: `${API_BASE_URL}/api/boomgate`,
        carlift: `${API_BASE_URL}/api/carlift`,
        carparkutilisation: `${API_BASE_URL}/api/carparkutilisation`,
        mechanical: `${API_BASE_URL}/api/mechanical`,
        rampdrawer: `${API_BASE_URL}/api/rampdrawer`,
        streetsection: `${API_BASE_URL}/api/streetsection`,
        sendform: `${API_BASE_URL}/api/sendform`,
        signup: `${API_BASE_URL}/api/signup`,
        twoWayPassing: `${API_BASE_URL}/api/two-way-passing`,
        'reset-password': `${API_BASE_URL}/api/account/password`,
        passwordResetRequest: `${API_BASE_URL}/api/password-reset-request`,
        passwordResetConfirm: `${API_BASE_URL}/api/password-reset-confirm`
    },
    
    // Wrapper fetch function - uses native fetch to avoid infinite loops
    fetch: async function(endpoint, options = {}) {
        const url = this.endpoints[endpoint] || endpoint;
        
        // Add authorization header if token exists
        const token = localStorage.getItem('authToken');
        if (token && !options.headers) {
            options.headers = {};
        }
        if (token && options.headers && !options.headers.Authorization) {
            options.headers.Authorization = `Bearer ${token}`;
        }
        
        // Ensure Content-Type is set for JSON requests
        if (options.body && typeof options.body === 'object' && !options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        
        // Use native fetch directly to avoid infinite loop with tracking.js
        return nativeFetch(url, options);
    }
};

console.log('API Configuration loaded:', window.API_CONFIG.baseUrl);