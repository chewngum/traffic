// manifest.js - Site manifest loading and fallback configuration

let SITE_MANIFEST = null;

async function loadSiteManifest() {
    if (SITE_MANIFEST) return SITE_MANIFEST;

    try {
        const response = await fetch('/auth-manifest.json');
        if (!response.ok) {
            throw new Error(`Failed to load manifest: ${response.status}`);
        }
        SITE_MANIFEST = await response.json();
        return SITE_MANIFEST;
    } catch (error) {
        return getFallbackConfig();
    }
}

function getFallbackConfig() {
    // Fallback config using role-based authorization (matches auth-manifest.json)
    return {
        roles: {
            guest: { id: "guest", name: "Guest", color: "#95a5a6" },
            authenticated: { id: "authenticated", name: "Authenticated", color: "#6c757d" },
            paying: { id: "paying", name: "Paying User", color: "#6b99c2" },
            beta: { id: "beta", name: "Beta Access", color: "#f39c12" },
            admin: { id: "admin", name: "Admin", color: "#354e8d" }
        },
        pages: {
            // Public pages
            "/": { name: "Home", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/support/about/": { name: "About", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/support/contact/": { name: "Contact", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/support/terms/": { name: "Terms", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/support/privacy/": { name: "Privacy", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/login/": { name: "Login", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/login/signup/": { name: "Sign Up", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/login/login-required/": { name: "Login Required", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },
            "/login/upgrade-required/": { name: "Upgrade Required", allowedRoles: ["guest", "authenticated", "paying", "beta", "admin"] },

            // Authenticated pages
            "/traffic/": { name: "Dashboard", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/traffic/simulators/": { name: "Simulations", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/traffic/tools/": { name: "Tools", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/support/": { name: "Support", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/support/glossary/": { name: "Glossary", allowedRoles: ["authenticated", "paying", "beta", "admin"] },

            // Simulators
            "/traffic/simulators/boomgate/": { name: "Boom Gate", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/traffic/simulators/two-way-passing/": { name: "Two-Way Passing", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/traffic/simulators/carparkutilisation/": { name: "Car Park Utilisation", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/traffic/simulators/carlift/": { name: "Car Lift", allowedRoles: ["beta", "admin"] },
            "/traffic/simulators/mechanical/": { name: "Mechanical Parking", allowedRoles: ["beta", "admin"] },
            "/traffic/simulators/schoolpickup/": { name: "School Pickup", allowedRoles: ["beta", "admin"] },

            // Tools
            "/traffic/tools/rampdrawer/": { name: "Ramp Design", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/traffic/tools/streetsection/": { name: "Street Section", allowedRoles: ["authenticated", "paying", "beta", "admin"] },
            "/traffic/tools/network/": { name: "Traffic Network", allowedRoles: ["beta", "admin"] },

            // Premium/Paying
            "/support/FAQ/": { name: "FAQ", allowedRoles: ["paying", "beta", "admin"] },
            "/admin/account/": { name: "Account", allowedRoles: ["paying", "beta", "admin"] }
        },
        settings: {
            tokenExpiry: 24
        }
    };
}

function getSiteManifest() {
    return SITE_MANIFEST;
}

export { loadSiteManifest, getSiteManifest, getFallbackConfig };
