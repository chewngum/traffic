// common.js - Main entry point that coordinates all modules

// Import all modules
import { loadSiteManifest, getSiteManifest } from './utils/manifest.js';
import { setupFetchTracking, recordSimulationUsage, getCurrentSimulationType } from './utils/tracking.js';
import { 
    isUserAuthenticated, 
    getUserAccessLevel, 
    getUserDisplayName, 
    checkPageAccess,
    logout 
} from './utils/auth.js';
import { 
    getCurrentPageType,
    getCurrentPageInfo,
    injectTopNavigation 
} from './utils/navigation.js';
import { setupMobileNavigation } from './utils/mobile_navigation.js';  
import { 
    scrollToElement,
    scrollToProgress,
    scrollToResults,
    scrollToElementAdvanced,
    focusElement,
    injectFavicons 
} from './utils/ui_utilities.js';
import { injectContactForm, setupContactForm } from './utils/contact_form.js';
import { 
    formatScientific,
    formatTime,
    getZScoreForConfidence,
    createAccurateProgressTracker,
    generateValidationSection,
    formatEstimatedTime,
    createRealisticProgress
} from './utils/simulation_utils.js';
import { 
    estimateSimulationRuntime,
    updateRuntimeEstimateDisplay
} from './utils/runtime_estimation.js';

// Assign functions directly to global scope for backwards compatibility
Object.assign(window, {
    // Auth functions
    logout,
    returnToDashboard: function() {
        window.location.href = '/traffic/';
    },
    
    // Manifest
    getSiteManifest,
    
    // Auth
    isUserAuthenticated,
    getUserAccessLevel,
    getUserDisplayName,
    
    // Navigation
    getCurrentPageType,
    getCurrentPageInfo,
    
    // UI Utilities
    scrollToElement,
    scrollToProgress,
    scrollToResults,
    scrollToElementAdvanced,
    focusElement,
    
    // Simulation Utilities
    formatScientific,
    formatTime,
    getZScoreForConfidence,
    createAccurateProgressTracker,
    generateValidationSection,
    formatEstimatedTime,
    createRealisticProgress,
    
    // Runtime Estimation
    estimateSimulationRuntime,
    updateRuntimeEstimateDisplay,
    
    // Tracking
    recordSimulationUsage,
    getCurrentSimulationType
});

// Main initialization
document.addEventListener('DOMContentLoaded', async function() {
    // Load manifest first
    await loadSiteManifest();
    
    // Setup fetch tracking for simulation API calls
    setupFetchTracking();
    
    // Inject favicons on all pages
    injectFavicons();
    
    const pageType = getCurrentPageType();
    const isAuthenticated = isUserAuthenticated();
    
    // Check access for dashboard pages only
    if (pageType === 'dashboard' && isAuthenticated) {
        checkPageAccess();
    }
    
    // Always inject unified top navigation
    injectTopNavigation();
    
    // Only inject contact form for dashboard pages with authenticated users
    if (pageType === 'dashboard' && isAuthenticated) {
        injectContactForm();
        setupContactForm();
    }
});