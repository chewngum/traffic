/**
 * Authorization Service
 * Role-based access control system
 */

class AuthorizationService {
    constructor() {
        this.authManifest = null;
        this.initialized = false;
    }

    /**
     * Initialize the authorization service
     */
    async init() {
        if (this.initialized) return;

        try {
            const response = await fetch('/auth-manifest.json');
            if (!response.ok) {
                throw new Error('Failed to load authorization manifest');
            }
            this.authManifest = await response.json();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize authorization service:', error);
            throw error;
        }
    }

    /**
     * Get user's current roles from JWT token
     * @returns {Array} Array of role IDs
     */
    getUserRoles() {
        const token = localStorage.getItem('authToken');

        if (!token) {
            return ['guest'];
        }

        try {
            // Decode JWT payload (client-side only - server verifies)
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.warn('Invalid JWT format');
                return ['guest'];
            }

            const payload = JSON.parse(atob(parts[1]));

            // Check if token has expired
            if (payload.exp) {
                const now = Math.floor(Date.now() / 1000);
                if (now >= payload.exp) {
                    console.warn('Token has expired');
                    return ['guest'];
                }
            }

            // Parse roles from JWT payload
            const roles = payload.roles;

            // Handle both array and string formats
            if (Array.isArray(roles)) {
                return roles.length > 0 ? roles : ['guest'];
            } else if (typeof roles === 'string') {
                const rolesArray = roles.split(',').map(r => r.trim());
                return rolesArray.length > 0 ? rolesArray : ['guest'];
            }

            // Default to authenticated if logged in but no specific roles
            return ['authenticated'];
        } catch (error) {
            console.error('Error parsing user roles from JWT:', error);
            return ['guest'];
        }
    }

    /**
     * Check if user has any of the required roles
     * @param {Array} requiredRoles - Array of role IDs
     * @returns {boolean}
     */
    hasAnyRole(requiredRoles) {
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const userRoles = this.getUserRoles();

        // Check if user has any of the required roles
        return requiredRoles.some(role => userRoles.includes(role));
    }

    /**
     * Check if user has all of the required roles
     * @param {Array} requiredRoles - Array of role IDs
     * @returns {boolean}
     */
    hasAllRoles(requiredRoles) {
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const userRoles = this.getUserRoles();

        // Check if user has all required roles
        return requiredRoles.every(role => userRoles.includes(role));
    }

    /**
     * Check if user can access a specific page
     * @param {string} pagePath - Page path (e.g., "/traffic/")
     * @returns {boolean}
     */
    canAccessPage(pagePath) {
        if (!this.authManifest) {
            console.warn('Authorization manifest not loaded');
            return false;
        }

        const page = this.authManifest.pages[pagePath];
        if (!page) {
            console.warn(`Page not found in manifest: ${pagePath}`);
            return false;
        }

        return this.hasAnyRole(page.allowedRoles);
    }

    /**
     * Get page configuration
     * @param {string} pagePath - Page path
     * @returns {Object|null}
     */
    getPageConfig(pagePath) {
        if (!this.authManifest) {
            return null;
        }
        return this.authManifest.pages[pagePath] || null;
    }

    /**
     * Get all roles configuration
     * @returns {Object}
     */
    getRolesConfig() {
        return this.authManifest?.roles || {};
    }

    /**
     * Get role configuration by ID
     * @param {string} roleId - Role ID
     * @returns {Object|null}
     */
    getRoleConfig(roleId) {
        const roles = this.getRolesConfig();
        return roles[roleId] || null;
    }

    /**
     * Get the highest priority role for the user
     * @returns {Object|null}
     */
    getUserPrimaryRole() {
        const userRoles = this.getUserRoles();
        const rolesConfig = this.getRolesConfig();

        let highestPriority = -1;
        let primaryRole = null;

        userRoles.forEach(roleId => {
            const roleConfig = rolesConfig[roleId];
            if (roleConfig && roleConfig.priority > highestPriority) {
                highestPriority = roleConfig.priority;
                primaryRole = roleConfig;
            }
        });

        return primaryRole;
    }

    /**
     * Get badge HTML for a role
     * @param {string} roleId - Role ID
     * @returns {string} HTML string for badge
     */
    getRoleBadge(roleId) {
        const role = this.getRoleConfig(roleId);
        if (!role) return '';

        return `<span class="role-badge" style="background-color: ${role.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">${role.badge}</span>`;
    }

    /**
     * Get all badges for required roles
     * @param {Array} roleIds - Array of role IDs
     * @returns {string} HTML string for badges
     */
    getRoleBadges(roleIds) {
        if (!roleIds || roleIds.length === 0) return '';

        // Get the minimum required role (highest priority)
        const rolesConfig = this.getRolesConfig();
        let minRole = null;
        let minPriority = Infinity;

        roleIds.forEach(roleId => {
            const roleConfig = rolesConfig[roleId];
            if (roleConfig && roleConfig.priority < minPriority && roleConfig.id !== 'guest') {
                minPriority = roleConfig.priority;
                minRole = roleConfig;
            }
        });

        if (!minRole) return '';

        return this.getRoleBadge(minRole.id);
    }

    /**
     * Check page access and redirect if unauthorized
     * @param {string} pagePath - Current page path
     */
    checkPageAccessAndRedirect(pagePath) {
        if (!this.canAccessPage(pagePath)) {
            const userRoles = this.getUserRoles();

            // If not logged in, redirect to login
            if (userRoles.includes('guest') && userRoles.length === 1) {
                window.location.href = '/login/login-required/';
                return false;
            }

            // If logged in but insufficient access, redirect to upgrade page
            window.location.href = '/login/upgrade-required/';
            return false;
        }

        return true;
    }

    /**
     * Filter navigation items based on user's roles
     * @param {Object} navigation - Navigation configuration
     * @returns {Object} Filtered navigation
     */
    filterNavigation(navigation) {
        const filtered = {};

        for (const [key, item] of Object.entries(navigation)) {
            if (this.hasAnyRole(item.allowedRoles)) {
                filtered[key] = { ...item };

                // Filter children if they exist
                if (item.children) {
                    filtered[key].children = item.children.filter(child =>
                        this.hasAnyRole(child.allowedRoles)
                    );
                }
            }
        }

        return filtered;
    }

    /**
     * Get manifest settings
     * @returns {Object}
     */
    getSettings() {
        return this.authManifest?.settings || {};
    }
}

// Create singleton instance
const authService = new AuthorizationService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = authService;
}
