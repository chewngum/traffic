// auth.js - Authentication and access control

import { getSiteManifest } from './manifest.js';

function isUserAuthenticated() {
    const token = localStorage.getItem('authToken');
    return token && isValidToken(token);
}

function isValidToken(token) {
    try {
        // Decode JWT payload (without verification - server verifies)
        const parts = token.split('.');
        if (parts.length !== 3) {
            // Silently return false for invalid format (common for unauthenticated users)
            return false;
        }

        const payload = JSON.parse(atob(parts[1]));

        // Check if token has expired
        if (payload.exp) {
            const now = Math.floor(Date.now() / 1000);
            if (now >= payload.exp) {
                // Token expired - silently return false
                return false;
            }
        }

        // Check required fields
        if (!payload.userId || !payload.username) {
            // Missing fields - silently return false
            return false;
        }

        return true;
    } catch (error) {
        // Silently handle token parsing errors (common for invalid/missing tokens)
        return false;
    }
}

function getUserAccessLevel() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            // No token - guest user, silently return 0
            return 0;
        }

        // Decode JWT payload
        const parts = token.split('.');
        if (parts.length !== 3) {
            // Invalid token format - silently return 0
            return 0;
        }

        const payload = JSON.parse(atob(parts[1]));
        const roles = Array.isArray(payload.roles) ? payload.roles : [];

        // Role to access level mapping:
        // - guest or no roles: 0
        // - authenticated: 1
        // - paying: 2
        // - admin: 3
        // - beta: 3
        let level = 0;
        if (roles.includes('admin') || roles.includes('beta')) {
            level = 3;
        } else if (roles.includes('paying')) {
            level = 2;
        } else if (roles.includes('authenticated')) {
            level = 1;
        }

        return level;
    } catch (error) {
        // Silently handle errors (invalid token)
        return 0;
    }
}

function getUserDisplayName() {
    try {
        const displayName = localStorage.getItem('userDisplayName');
        if (displayName) return displayName;

        const token = localStorage.getItem('authToken');
        if (!token) return 'User';

        // Decode JWT payload
        const parts = token.split('.');
        if (parts.length !== 3) return 'User';

        const payload = JSON.parse(atob(parts[1]));
        return payload.displayName || payload.username || 'User';
    } catch {
        return 'User';
    }
}

function getUserRoles() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            return ['guest'];
        }

        // Decode JWT payload
        const parts = token.split('.');
        if (parts.length !== 3) {
            return ['guest'];
        }

        const payload = JSON.parse(atob(parts[1]));
        const roles = payload.roles;

        // Handle both array and string formats
        if (Array.isArray(roles)) {
            const result = roles.length > 0 ? roles : ['guest'];
            return result;
        } else if (typeof roles === 'string') {
            const rolesArray = roles.split(',').map(r => r.trim());
            const result = rolesArray.length > 0 ? rolesArray : ['guest'];
            return result;
        }

        return ['guest'];
    } catch (error) {
        return ['guest'];
    }
}

function checkPageAccess() {
    const manifest = getSiteManifest();
    if (!manifest) {
        console.log('🔍 AUTH DEBUG: Manifest not loaded');
        return;
    }

    const currentPath = window.location.pathname;
    const pageInfo = manifest.pages[currentPath];

    // If page is not in manifest, allow access (for unknown/legacy pages)
    if (!pageInfo) {
        return;
    }

    // Get user's roles
    const userRoles = getUserRoles();

    // Check if user has any of the allowed roles for this page
    const allowedRoles = pageInfo.allowedRoles || [];

    // If no specific roles required, allow access
    if (allowedRoles.length === 0) {
        return;
    }

    // Check if user has any of the required roles
    const hasAccess = allowedRoles.some(role => userRoles.includes(role));

    if (!hasAccess) {
        // If user only has guest role, redirect to login
        if (userRoles.length === 1 && userRoles[0] === 'guest') {
            window.location.href = `/login/login-required/?from=${encodeURIComponent(currentPath)}`;
            return;
        }

        // Otherwise, user is logged in but doesn't have required role
        window.location.href = `/login/upgrade-required/?from=${encodeURIComponent(currentPath)}`;
        return;
    }
}

function showAccessDeniedOverlay(currentPath, requiredLevel, userLevel) {
    const manifest = getSiteManifest();
    if (!manifest) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'accessDeniedOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(5px);
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 15px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        width: 90%;
        text-align: center;
        position: relative;
        animation: slideIn 0.3s ease-out;
    `;
    
    const pageInfo = manifest.pages[currentPath];
    const pageName = pageInfo?.name || 'This page';
    const requiredLevelInfo = manifest.accessLevels[requiredLevel];
    const userLevelInfo = manifest.accessLevels[userLevel];
    const requiredLevelName = requiredLevelInfo?.name || `Level ${requiredLevel}`;
    const userLevelName = userLevelInfo?.name || `Level ${userLevel}`;
    const requiredColor = requiredLevelInfo?.color || '#6c757d';
    const userColor = userLevelInfo?.color || '#6c757d';
    
    modal.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="font-size: 48px; margin-bottom: 10px;">🔒</div>
            <h2 style="color: #354e8d; margin: 0 0 10px 0; font-size: 1.5rem;">Access Restricted</h2>
            <p style="color: #6c757d; margin: 0; font-size: 1rem;">
                ${pageName} requires ${requiredLevelName} access or higher.
            </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: 500;">Your Access Level:</span>
                <span style="background: ${userColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
                    ${userLevelName}
                </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 500;">Required Level:</span>
                <span style="background: ${requiredColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
                    ${requiredLevelName}
                </span>
            </div>
        </div>
        
        <p style="color: #6c757d; font-size: 0.9rem; margin: 20px 0;">
            Contact your administrator to upgrade your access level.
        </p>
        
        <button onclick="returnToDashboard()" style="
            background: #6b99c2;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
        " onmouseover="this.style.background='#5a88b0'" onmouseout="this.style.background='#6b99c2'">
            Return to Dashboard
        </button>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(style);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    overlay.style.pointerEvents = 'all';
    
    const preventEscape = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    
    document.addEventListener('keydown', preventEscape);
    document.addEventListener('contextmenu', preventEscape);
    
    window.returnToDashboard = function() {
        window.location.href = '/traffic/';
    };
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userAccessLevel');
    localStorage.removeItem('userDisplayName');
    localStorage.removeItem('userEmail');
    window.location.href = '/login/';
}

export {
    isUserAuthenticated,
    isValidToken,
    getUserAccessLevel,
    getUserDisplayName,
    getUserRoles,
    checkPageAccess,
    showAccessDeniedOverlay,
    logout
};
