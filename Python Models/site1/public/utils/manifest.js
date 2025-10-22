// manifest.js - Site manifest loading and fallback configuration

let SITE_MANIFEST = null;

async function loadSiteManifest() {
    if (SITE_MANIFEST) return SITE_MANIFEST;
    
    try {
        const response = await fetch('/site-manifest.json');
        if (!response.ok) {
            throw new Error(`Failed to load manifest: ${response.status}`);
        }
        SITE_MANIFEST = await response.json();
        return SITE_MANIFEST;
    } catch (error) {
        console.error('Error loading site manifest:', error);
        return getFallbackConfig();
    }
}

function getFallbackConfig() {
    return {
        pages: {
            // Public pages (no login required)
            "/": { name: "Home", accessLevel: 0 },
            "/about/": { name: "About", accessLevel: 0 },
            "/contact/": { name: "Contact", accessLevel: 0 },
            "/terms/": { name: "Terms of Service", accessLevel: 0 },
            "/privacy/": { name: "Privacy Policy", accessLevel: 0 },
            "/login/": { name: "Login", accessLevel: 0 },
            "/signup/": { name: "Sign Up", accessLevel: 0 },
            "/forgot-password/": { name: "Forgot Password", accessLevel: 0 },
            "/reset-password/": { name: "Reset Password", accessLevel: 0 },
            "/login-required/": { name: "Login Required", accessLevel: 0 },
            "/upgrade-required/": { name: "Upgrade Required", accessLevel: 0 },

            // Private pages (login required - access level 1+)
            "/traffic/": { name: "Dashboard", accessLevel: 1 },
            "/traffic/simulators/": { name: "Simulations", accessLevel: 1 },
            "/traffic/tools/": { name: "Tools", accessLevel: 1 },
            "/support/": { name: "Support", accessLevel: 1 },
            "/support/FAQ/": { name: "FAQ", accessLevel: 3 },
            "/support/glossary/": { name: "Glossary", accessLevel: 1 },
            "/support/scenarios/": { name: "Scenarios", accessLevel: 3 },
            "/account/": { name: "Account Settings", accessLevel: 2 },

            // Simulators (access level 1)
            "/traffic/simulators/boomgate/": { name: "Boom Gate Simulation", accessLevel: 1 },
            "/traffic/simulators/two-way-passing/": { name: "Two-Way Passing Simulation", accessLevel: 1 },
            "/traffic/simulators/carparkutilisation/": { name: "Car Park Utilisation", accessLevel: 1 },
            "/traffic/simulators/carlift/": { name: "Car Lift Simulation", accessLevel: 1 },
            "/traffic/simulators/mechanical/": { name: "Mechanical Parking Structure", accessLevel: 1 },

            // Tools (access level 1)
            "/traffic/tools/rampdrawer/": { name: "Ramp Design Tool", accessLevel: 1 },
            "/traffic/tools/streetsection/": { name: "Street Section Designer", accessLevel: 1 },

            // Premium pages (access level 3)
            "/traffic/simulators/schoolpickup/": { name: "School Pickup Simulation", accessLevel: 3 },
            "/traffic/tools/network/": { name: "Traffic Network Database", accessLevel: 3 }
        },
        navigation: {
            dashboard: { label: "Dashboard", path: "/traffic/" },
            simulators: {
                label: "Simulations",
                path: "/traffic/simulators/",
                children: [
                    { label: "Boom Gate", path: "/traffic/simulators/boomgate/", accessLevel: 1, pageId: "boomgate" },
                    { label: "Two-Way Passing", path: "/traffic/simulators/two-way-passing/", accessLevel: 1, pageId: "two-way-passing" },
                    { label: "School Pickup", path: "/traffic/simulators/schoolpickup/", accessLevel: 3, pageId: "schoolpickup" },
                    { label: "Car Park Utilisation", path: "/traffic/simulators/carparkutilisation/", accessLevel: 1, pageId: "carparkutilisation" },
                    { label: "Car Lift", path: "/traffic/simulators/carlift/", accessLevel: 1, pageId: "carlift" },
                    { label: "Mechanical Parking", path: "/traffic/simulators/mechanical/", accessLevel: 1, pageId: "mechanical" }
                ]
            },
            tools: {
                label: "Tools",
                path: "/traffic/tools/",
                children: [
                    { label: "Ramp Design", path: "/traffic/tools/rampdrawer/", accessLevel: 1, pageId: "rampdrawer" },
                    { label: "Street Section", path: "/traffic/tools/streetsection/", accessLevel: 1, pageId: "streetsection" },
                    { label: "Traffic Network", path: "/traffic/tools/network/", accessLevel: 3, pageId: "network" }
                ]
            },
            support: {
                label: "Support",
                path: "/support/",
                children: [
                    { label: "FAQ", path: "/support/FAQ/", accessLevel: 3, pageId: "faq" },
                    { label: "Glossary", path: "/support/glossary/", accessLevel: 1, pageId: "glossary" },
                    { label: "Scenarios", path: "/support/scenarios/", accessLevel: 3, pageId: "scenarios" }
                ]
            },
            accounts: { label: "Account", path: "/account/", accessLevel: 2 }
        },
        accessLevels: {
            0: { name: "Public", color: "#95a5a6" },
            1: { name: "Guest", color: "#6c757d" },
            2: { name: "Standard", color: "#6b99c2" },
            3: { name: "Premium", color: "#354e8d" }
        },
        settings: {
            tokenExpiry: 24 // hours
        }
    };
}

function getSiteManifest() {
    return SITE_MANIFEST;
}

export { loadSiteManifest, getSiteManifest, getFallbackConfig };
