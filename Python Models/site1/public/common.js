// common.js - Main entry point that coordinates all modules

// Import all modules
import { loadSiteManifest, getSiteManifest } from './utils/manifest.js';
import { setupFetchTracking, recordSimulationUsage, getCurrentSimulationType } from './utils/tracking.js';
import {
    isUserAuthenticated,
    isValidToken,
    getUserAccessLevel,
    getUserDisplayName,
    getUserRoles,
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
import { initializeFooter } from './utils/footer.js';
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
    isValidToken,
    getUserAccessLevel,
    getUserDisplayName,
    getUserRoles,
    
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

    // Inject favicons on all pages
    injectFavicons();

    const pageType = getCurrentPageType();
    const pageInfo = getCurrentPageInfo();
    const isAuthenticated = isUserAuthenticated();

    // Setup fetch tracking only on simulator and tool pages
    if (pageInfo.category === 'simulators' || pageInfo.category === 'tools') {
        setupFetchTracking();
    }

    // Check page access for all pages (auth.js will skip public pages)
    checkPageAccess();
    
    // Always inject unified top navigation
    injectTopNavigation();

    // Inject contact/feedback form on all pages except homepage (which has its own)
    const isHomepage = window.location.pathname === '/' || window.location.pathname === '/index.html';
    if (!isHomepage) {
        injectContactForm();
        setupContactForm();
    }

    // Inject footer sitemap on all pages
    initializeFooter();
});