// navigation.js - Navigation components and menus

import { getSiteManifest } from './manifest.js';
import { isUserAuthenticated, getUserAccessLevel, getUserDisplayName, logout } from './auth.js';
import { setupMobileNavigation } from './mobile_navigation.js';

function getCurrentPageType() {
    const path = window.location.pathname;
    
    if (path === '/' || path === '/index.html') {
        return 'home';
    } else if (path === '/login/' || path.includes('login')) {
        return 'login';
    } else if (path === '/login/signup/' || path.includes('signup')) {
        return 'signup';
    } else {
        return 'dashboard';
    }
}

function getCurrentPageInfo() {
    const manifest = getSiteManifest();
    if (!manifest) return { category: null, page: null };
    
    const path = window.location.pathname;
    const nav = manifest.navigation;
    
    if (nav.dashboard && path === nav.dashboard.path) {
        return { category: 'dashboard', page: 'dashboard' };
    }
    
    if (nav.simulators) {
        if (path === nav.simulators.path) {
            return { category: 'simulators', page: 'simulators' };
        }
        if (nav.simulators.children) {
            for (const child of nav.simulators.children) {
                if (path === child.path) {
                    return { category: 'simulators', page: child.pageId };
                }
            }
        }
    }
    
    if (nav.tools) {
        if (path === nav.tools.path) {
            return { category: 'tools', page: 'tools' };
        }
        if (nav.tools.children) {
            for (const child of nav.tools.children) {
                if (path === child.path) {
                    return { category: 'tools', page: child.pageId };
                }
            }
        }
    }
    
    if (nav.support) {
        if (path === nav.support.path) {
            return { category: 'support', page: 'support' };
        }
        if (nav.support.children) {
            for (const child of nav.support.children) {
                if (path === child.path) {
                    return { category: 'support', page: child.pageId };
                }
            }
        }
    }
    
    if (nav.account && path === nav.account.path) {
        return { category: 'account', page: 'account' };
    }
    
    return { category: null, page: null };
}

function generateBreadcrumbs() {
    const currentPath = window.location.pathname;
    const pathParts = currentPath.split('/').filter(part => part.length > 0);
    
    let breadcrumbs = '<a href="/" class="nav-item">Home</a>';
    let accumulatedPath = '';
    
    const pathLabels = {
        'traffic': 'Dashboard',
        'simulators': 'Simulations',
        'tools': 'Tools',
        'support': 'Support',
        'accounts': 'Account',
        'boomgate': 'Boom Gate',
        'carlift': 'Car Lift',
        'carparkutilisation': 'Car Park Utilisation',
        'mechanical': 'Mechanical Parking',
        'two-way-passing': 'Two-Way Passing',
        'schoolpickup': 'School Pickup',
        'rampdrawer': 'Ramp Design',
        'streetsection': 'Street Section',
        'network': 'Traffic Network',
        'FAQ': 'FAQ',
        'glossary': 'Glossary',
        'scenarios': 'Scenarios',
        'account': 'Account',
        'admin': 'Admin',
    };
    
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        accumulatedPath += '/' + part;
        
        const label = pathLabels[part] || part.charAt(0).toUpperCase() + part.slice(1);
        
        if (i === pathParts.length - 1) {
            breadcrumbs += ` <span class="breadcrumb-separator">›</span> <span class="nav-item current">${label}</span>`;
        } else {
            breadcrumbs += ` <span class="breadcrumb-separator">›</span> <a href="${accumulatedPath}/" class="nav-item">${label}</a>`;
        }
    }
    
    return breadcrumbs;
}

function buildBottomMenu() {
    const manifest = getSiteManifest();
    if (!manifest) return '';

    const currentPage = getCurrentPageInfo();
    const userAccessLevel = getUserAccessLevel();
    const isAuthenticated = isUserAuthenticated();

    const isAccessible = (path) => {
        if (!isAuthenticated) return false;
        const pageInfo = manifest.pages[path];
        return !pageInfo || userAccessLevel >= pageInfo.accessLevel;
    };

    let menuHTML = '';

    // Dashboard
    const dashboardNav = manifest.navigation?.dashboard;
    if (dashboardNav && isAccessible(dashboardNav.path)) {
        const isActive = currentPage.category === 'dashboard';
        menuHTML += `
            <a href="${dashboardNav.path}" class="bottom-menu-item ${isActive ? 'active' : ''}">
                <span class="menu-label">${dashboardNav.label}</span>
            </a>
        `;
    }

    // All Simulations as individual links
    const simulatorsNav = manifest.navigation?.simulators;
    if (simulatorsNav?.children) {
        const accessibleSims = simulatorsNav.children.filter(child => isAccessible(child.path));

        accessibleSims.forEach(child => {
            const isActive = currentPage.page === child.pageId;
            menuHTML += `
                <a href="${child.path}" class="bottom-menu-item ${isActive ? 'active' : ''}">
                    <span class="menu-label">${child.label}</span>
                </a>
            `;
        });
    }

    // All Tools as individual links
    const toolsNav = manifest.navigation?.tools;
    if (toolsNav?.children) {
        const accessibleTools = toolsNav.children.filter(child => isAccessible(child.path));

        accessibleTools.forEach(child => {
            const isActive = currentPage.page === child.pageId;
            menuHTML += `
                <a href="${child.path}" class="bottom-menu-item ${isActive ? 'active' : ''}">
                    <span class="menu-label">${child.label}</span>
                </a>
            `;
        });
    }

    // All Support as individual links
    const supportNav = manifest.navigation?.support;
    if (supportNav?.children) {
        const accessibleSupport = supportNav.children.filter(child => isAccessible(child.path));

        accessibleSupport.forEach(child => {
            const isActive = currentPage.page === child.pageId;
            menuHTML += `
                <a href="${child.path}" class="bottom-menu-item ${isActive ? 'active' : ''}">
                    <span class="menu-label">${child.label}</span>
                </a>
            `;
        });
    }

    // Account
    const accountNav = manifest.navigation?.account;
    if (accountNav && isAccessible(accountNav.path)) {
        const isActive = currentPage.category === 'account';
        menuHTML += `
            <a href="${accountNav.path}" class="bottom-menu-item ${isActive ? 'active' : ''}">
                <span class="menu-label">${accountNav.label}</span>
            </a>
        `;
    }

    return menuHTML;
}

function injectBottomMenuCSS() {
    const existingStyle = document.getElementById('bottom-menu-styles');
    if (existingStyle) return;

    const style = document.createElement('style');
    style.id = 'bottom-menu-styles';
    style.textContent = `
        .bottom-menu-container {
            background: linear-gradient(135deg, #354e8d 0%, #496f9c 100%);
            padding: 4px 12px;
            border-top: 1px solid #6b99c2;
        }
        .bottom-menu {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 6px;
            max-width: 1400px;
            margin: 0 auto;
        }
        .bottom-menu-item {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            text-decoration: none;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.75rem;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        .bottom-menu-item:hover {
            color: white;
            background: rgba(255, 255, 255, 0.1);
        }
        .bottom-menu-item.active {
            color: #87ceeb;
            background: rgba(255, 255, 255, 0.15);
            font-weight: 600;
        }
        .menu-label {
            line-height: 1.1;
        }

        /* Mobile Navigation Styles */
        .mobile-nav-toggle {
            background: none;
            border: none;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            width: 32px;
            height: 32px;
            cursor: pointer;
            padding: 0;
        }
        .mobile-nav-toggle span {
            display: block;
            width: 20px;
            height: 2px;
            background: #354e8d;
            margin: 2px 0;
            transition: all 0.3s ease;
        }
        .mobile-nav-toggle.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }
        .mobile-nav-toggle.active span:nth-child(2) {
            opacity: 0;
        }
        .mobile-nav-toggle.active span:nth-child(3) {
            transform: rotate(-45deg) translate(7px, -6px);
        }
        .mobile-nav-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            display: none;
            backdrop-filter: blur(5px);
        }
        .mobile-nav-overlay.active {
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
            padding-top: 80px;
        }
        .mobile-nav-menu {
            background: white;
            width: 300px;
            max-width: 85vw;
            height: calc(100vh - 80px);
            border-radius: 15px 0 0 15px;
            box-shadow: -5px 0 25px rgba(0, 0, 0, 0.2);
            overflow-y: auto;
        }
        @media (min-width: 769px) {
            .mobile-nav-toggle { display: none; }
        }

        /* Dropdown Menu Styles */
        .nav-dropdown {
            position: relative;
            display: inline-block;
        }
        .dropdown-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .dropdown-arrow {
            transition: transform 0.2s ease;
        }
        .dropdown-toggle[aria-expanded="true"] .dropdown-arrow {
            transform: rotate(180deg);
        }
        .dropdown-menu {
            position: absolute;
            top: 100%;
            right: 0;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            min-width: 200px;
            padding: 8px 0;
            z-index: 1000;
            display: none;
            opacity: 0;
            transform: translateY(0);
            transition: opacity 0.2s ease, transform 0.2s ease;
            margin-top: 0;
        }
        .dropdown-menu.show {
            display: block;
            opacity: 1;
            transform: translateY(0);
        }
        .dropdown-item {
            display: block;
            width: 100%;
            padding: 10px 20px;
            text-align: left;
            text-decoration: none;
            color: #354e8d;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 0.9rem;
            font-family: inherit;
            transition: background-color 0.2s ease;
        }
        .dropdown-item:hover {
            background-color: #f5f5f5;
            color: #2c3e50;
        }
        .dropdown-divider {
            height: 1px;
            background-color: #e0e0e0;
            margin: 8px 0;
        }
        .logout-item {
            color: #d32f2f;
            font-weight: 500;
        }
        .logout-item:hover {
            background-color: #ffebee;
            color: #c62828;
        }
        .signup-item {
            color: #6b99c2;
            font-weight: 500;
        }
        .signup-item:hover {
            background-color: #e3f2fd;
            color: #5a88b0;
        }
    `;
    document.head.appendChild(style);
}

function setupDropdownMenu() {
    const dropdownToggle = document.getElementById('navDropdownToggle');
    const dropdownMenu = document.getElementById('navDropdownMenu');
    const navDropdown = dropdownToggle?.closest('.nav-dropdown');

    if (!dropdownToggle || !dropdownMenu || !navDropdown) return;

    let isMouseOverDropdown = false;

    // Toggle dropdown on button click
    dropdownToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        const isExpanded = dropdownToggle.getAttribute('aria-expanded') === 'true';

        if (isExpanded) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    // Track mouse over dropdown container
    navDropdown.addEventListener('mouseenter', function() {
        isMouseOverDropdown = true;
    });

    navDropdown.addEventListener('mouseleave', function() {
        isMouseOverDropdown = false;
        // Small delay to allow clicking on menu items
        setTimeout(() => {
            if (!isMouseOverDropdown) {
                closeDropdown();
            }
        }, 100);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!navDropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    // Close dropdown on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    function openDropdown() {
        dropdownToggle.setAttribute('aria-expanded', 'true');
        dropdownMenu.classList.add('show');
    }

    function closeDropdown() {
        dropdownToggle.setAttribute('aria-expanded', 'false');
        dropdownMenu.classList.remove('show');
    }
}

function injectTopNavigation() {
    const pageType = getCurrentPageType();
    const isAuthenticated = isUserAuthenticated();

    const topNav = document.createElement('nav');
    topNav.className = 'top-nav';

    let breadcrumbs;
    if (pageType === 'home') {
        breadcrumbs = '<span class="nav-item current">Home</span>';
    } else if (pageType === 'login') {
        breadcrumbs = '<a href="/" class="nav-item">Home</a> <span class="breadcrumb-separator">›</span> <span class="nav-item current">Sign In</span>';
    } else if (pageType === 'signup') {
        breadcrumbs = '<a href="/" class="nav-item">Home</a> <span class="breadcrumb-separator">›</span> <span class="nav-item current">Sign Up</span>';
    } else {
        breadcrumbs = generateBreadcrumbs();
    }

    const username = isAuthenticated ? getUserDisplayName() : '';
    const bottomMenu = buildBottomMenu();

    topNav.innerHTML = `
        <div class="nav-container">
            <div class="nav-left">
                <button class="mobile-nav-toggle" id="mobileNavToggle" aria-label="Toggle navigation">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
                <a href="/" class="logo-section">
                    <img src="/assets/images/logo.png" alt="Traffic Labb" class="logo-image">
                    ${pageType === 'dashboard' ? '' : '<span>Traffic Labb</span>'}
                </a>
            </div>
            <div class="nav-center">
                <div class="breadcrumb-nav">
                    ${breadcrumbs}
                </div>
            </div>
            <div class="nav-right">
                ${isAuthenticated ? `
                    <span class="user-info">Welcome, ${username}</span>
                ` : ''}
                <div class="nav-dropdown">
                    <button class="nav-button ${isAuthenticated ? 'secondary' : 'primary'} dropdown-toggle" id="navDropdownToggle" aria-label="User menu" aria-expanded="false">
                        Menu
                        <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M6 8L2 4h8L6 8z"/>
                        </svg>
                    </button>
                    <div class="dropdown-menu" id="navDropdownMenu">
                        <a href="/" class="dropdown-item">Home</a>
                        <a href="/traffic/" class="dropdown-item">Dashboard</a>
                        ${isAuthenticated ? `
                            <a href="/admin/account/" class="dropdown-item">Account Settings</a>
                        ` : `
                            <a href="/login/" class="dropdown-item">Login</a>
                        `}
                        <a href="/support/contact/" class="dropdown-item">Contact Us</a>
                        <a href="/support/about/" class="dropdown-item">About</a>
                        ${isAuthenticated ? `
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item logout-item" onclick="logout()">Logout</button>
                        ` : `
                            <div class="dropdown-divider"></div>
                            <a href="/login/signup/" class="dropdown-item signup-item">Sign Up</a>
                        `}
                    </div>
                </div>
            </div>
        </div>
        ${isAuthenticated ? `
        <div class="bottom-menu-container">
            <div class="bottom-menu">
                ${bottomMenu}
            </div>
        </div>
        ` : ''}
    `;

    document.body.insertBefore(topNav, document.body.firstChild);

    injectBottomMenuCSS();
    setupMobileNavigation();

    // Setup dropdown menu for all users
    setupDropdownMenu();
}

export {
    getCurrentPageType,
    getCurrentPageInfo,
    generateBreadcrumbs,
    buildBottomMenu,
    injectBottomMenuCSS,
    injectTopNavigation
};