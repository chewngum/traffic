// Common elements injected into all pages with access control
// Add this script to all simulation pages

// Global manifest variable
let SITE_MANIFEST = null;

// Load manifest from site-manifest.json
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
        // Fallback to hardcoded config if manifest fails to load
        return getFallbackConfig();
    }
}

function setupDesktopNavigation() {
    const desktopNav = document.getElementById('desktopNav');
    if (!desktopNav || !SITE_MANIFEST) return;
    
    const currentPage = getCurrentPageInfo();
    const userAccessLevel = getUserAccessLevel();
    const isAuthenticated = isUserAuthenticated();
    
    // Helper function to determine if page is accessible
    const isAccessible = (path) => {
        if (!isAuthenticated) return false; // Not accessible if not authenticated
        const pageInfo = SITE_MANIFEST.pages[path];
        return !pageInfo || userAccessLevel >= pageInfo.accessLevel;
    };
    
    let navHTML = '';
    
    // Dashboard link
    const dashboardNav = SITE_MANIFEST.navigation?.dashboard;
    if (dashboardNav) {
        const disabled = !isAuthenticated ? 'disabled' : '';
        const authInfo = !isAuthenticated ? '<small>(Login Required)</small>' : '';
        navHTML += `
            <div class="nav-dropdown">
                <a href="${dashboardNav.path}" class="nav-main-link ${currentPage.category === 'dashboard' ? 'active' : ''} ${disabled}">
                    ${dashboardNav.label}${authInfo}
                </a>
            </div>
        `;
    }
    
    // Simulations dropdown
    const simulatorsNav = SITE_MANIFEST.navigation?.simulators;
    if (simulatorsNav) {
        navHTML += `
            <div class="nav-dropdown">
                <a href="${simulatorsNav.path}" class="nav-main-link ${currentPage.category === 'simulators' ? 'active' : ''} ${!isAuthenticated ? 'disabled' : ''}">
                    ${simulatorsNav.label}
                    <span class="nav-dropdown-icon">▼</span>
                </a>
                <div class="nav-dropdown-menu">
                    <a href="${simulatorsNav.path}" class="nav-dropdown-item featured ${!isAuthenticated ? 'disabled' : ''}">
                        Simulations
                    </a>
        `;
        
        simulatorsNav.children?.forEach(child => {
            const disabled = !isAccessible(child.path) ? 'disabled' : '';
            const levelInfo = !isAuthenticated ? '<small>(Login Required)</small>' : 
                              !isAccessible(child.path) ? `<small>(Level ${child.accessLevel})</small>` : '';
            navHTML += `
                    <a href="${child.path}" class="nav-dropdown-item ${currentPage.page === child.pageId ? 'active' : ''} ${disabled}">
                        ${child.label}${levelInfo}
                    </a>
            `;
        });
        
        navHTML += `
                </div>
            </div>
        `;
    }
    
    // Tools dropdown
    const toolsNav = SITE_MANIFEST.navigation?.tools;
    if (toolsNav) {
        navHTML += `
            <div class="nav-dropdown">
                <a href="${toolsNav.path}" class="nav-main-link ${currentPage.category === 'tools' ? 'active' : ''} ${!isAuthenticated ? 'disabled' : ''}">
                    ${toolsNav.label}
                    <span class="nav-dropdown-icon">▼</span>
                </a>
                <div class="nav-dropdown-menu">
                    <a href="${toolsNav.path}" class="nav-dropdown-item featured ${!isAuthenticated ? 'disabled' : ''}">
                        Tools
                    </a>
        `;
        
        toolsNav.children?.forEach(child => {
            const disabled = !isAccessible(child.path) ? 'disabled' : '';
            const levelInfo = !isAuthenticated ? '<small>(Login Required)</small>' : 
                              !isAccessible(child.path) ? `<small>(Level ${child.accessLevel})</small>` : '';
            navHTML += `
                    <a href="${child.path}" class="nav-dropdown-item ${currentPage.page === child.pageId ? 'active' : ''} ${disabled}">
                        ${child.label}${levelInfo}
                    </a>
            `;
        });
        
        navHTML += `
                </div>
            </div>
        `;
    }
    
    // Support dropdown
    const supportNav = SITE_MANIFEST.navigation?.support;
    if (supportNav) {
        navHTML += `
            <div class="nav-dropdown">
                <a href="${supportNav.path}" class="nav-main-link ${currentPage.category === 'support' ? 'active' : ''} ${!isAuthenticated ? 'disabled' : ''}">
                    ${supportNav.label}
                    <span class="nav-dropdown-icon">▼</span>
                </a>
                <div class="nav-dropdown-menu">
                    <a href="${supportNav.path}" class="nav-dropdown-item featured ${!isAuthenticated ? 'disabled' : ''}">
                        Support
                    </a>
        `;
        
        supportNav.children?.forEach(child => {
            const disabled = !isAccessible(child.path) ? 'disabled' : '';
            const levelInfo = !isAuthenticated ? '<small>(Login Required)</small>' : 
                              !isAccessible(child.path) ? `<small>(Level ${child.accessLevel})</small>` : '';
            navHTML += `
                    <a href="${child.path}" class="nav-dropdown-item ${currentPage.page === child.pageId ? 'active' : ''} ${disabled}">
                        ${child.label}${levelInfo}
                    </a>
            `;
        });
        
        navHTML += `
                </div>
            </div>
        `;
    }
    
    // Account link
    const accountsNav = SITE_MANIFEST.navigation?.accounts;
    if (accountsNav) {
        const disabled = !isAccessible(accountsNav.path) ? 'disabled' : '';
        const levelInfo = !isAuthenticated ? '<small>(Login Required)</small>' : 
                          !isAccessible(accountsNav.path) ? `<small>(Level ${accountsNav.accessLevel})</small>` : '';
        navHTML += `
            <div class="nav-dropdown">
                <a href="${accountsNav.path}" class="nav-main-link ${currentPage.category === 'account' ? 'active' : ''} ${disabled}">
                    ${accountsNav.label}${levelInfo}
                </a>
            </div>
        `;
    }
    
    desktopNav.innerHTML = navHTML;
    
    // Add click handlers for disabled links
    desktopNav.addEventListener('click', function(e) {
        const target = e.target.closest('a');
        if (target && target.classList.contains('disabled')) {
            e.preventDefault();
            if (!isAuthenticated) {
                // Redirect to login
                window.location.href = '/login/';
                return;
            }
            const href = target.getAttribute('href');
            if (href && SITE_MANIFEST.pages[href]) {
                const requiredLevel = SITE_MANIFEST.pages[href].accessLevel;
                showAccessDeniedOverlay(href, requiredLevel, userAccessLevel);
            }
        }
    });
}

// Fallback configuration if manifest fails to load
function getFallbackConfig() {
    return {
        pages: {
            "/traffic/": { name: "Dashboard", accessLevel: 1 },
            "/traffic/simulators/boomgate/": { name: "Boom Gate Simulation", accessLevel: 1 },
            "/traffic/simulators/two-way-passing/": { name: "Two-Way Passing Simulation", accessLevel: 1 },
            "/traffic/simulators/schoolpickup/": { name: "School Pickup Simulation", accessLevel: 1 },
            "/traffic/simulators/carparkutilisation/": { name: "Car Park Utilisation", accessLevel: 2 },
            "/traffic/simulators/carlift/": { name: "Car Lift Simulation", accessLevel: 2 },
            "/traffic/simulators/mechanical/": { name: "Mechanical Parking Structure", accessLevel: 2 },
            "/traffic/tools/rampdrawer/": { name: "Ramp Design Tool", accessLevel: 1 },
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
                    { label: "School Pickup", path: "/traffic/simulators/schoolpickup/", accessLevel: 1, pageId: "schoolpickup" },
                    { label: "Car Park Utilisation", path: "/traffic/simulators/carparkutilisation/", accessLevel: 2, pageId: "carparkutilisation" },
                    { label: "Car Lift", path: "/traffic/simulators/carlift/", accessLevel: 2, pageId: "carlift" },
                    { label: "Mechanical Parking", path: "/traffic/simulators/mechanical/", accessLevel: 2, pageId: "mechanical" }
                ]
            },
            tools: {
                label: "Tools",
                path: "/traffic/tools/",
                children: [
                    { label: "Ramp Design", path: "/traffic/tools/rampdrawer/", accessLevel: 1, pageId: "rampdrawer" },
                    { label: "Traffic Network", path: "/traffic/tools/network/", accessLevel: 3, pageId: "network" }
                ]
            },
            support: {
                label: "Support",
                path: "/traffic/support/",
                children: [
                    { label: "FAQ", path: "/traffic/support/faq/", accessLevel: 1, pageId: "faq" },
                    { label: "Glossary", path: "/traffic/support/glossary/", accessLevel: 1, pageId: "glossary" }
                ]
            },
            accounts: { label: "Account", path: "/traffic/accounts/", accessLevel: 1 }
        },
        accessLevels: {
            1: { name: "Guest", color: "#6c757d" },
            2: { name: "Standard", color: "#6b99c2" },
            3: { name: "Premium", color: "#354e8d" }
        }
    };
}

// Determine current page type
function getCurrentPageType() {
    const path = window.location.pathname;
    
    if (path === '/' || path === '/index.html') {
        return 'home';
    } else if (path === '/login/' || path.includes('login')) {
        return 'login';
    } else {
        return 'dashboard';
    }
}

// Check if user is authenticated
function isUserAuthenticated() {
    const token = localStorage.getItem('authToken');
    return token && isValidToken(token);
}

// Smooth scrolling utility functions
function scrollToElement(elementId, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Element with ID '${elementId}' not found for scrolling`);
        return false;
    }
    
    const defaultOptions = {
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
    };
    
    const scrollOptions = { ...defaultOptions, ...options };
    
    // Add a small delay to ensure DOM is ready
    setTimeout(() => {
        element.scrollIntoView(scrollOptions);
    }, 100);
    
    return true;
}

function scrollToProgress() {
    return scrollToElement('progressContainer', { 
        behavior: 'smooth', 
        block: 'center' 
    });
}

function scrollToResults() {
    return scrollToElement('resultsSection', { 
        behavior: 'smooth', 
        block: 'start' 
    });
}

// Enhanced scroll to element with fallback by class or selector
function scrollToElementAdvanced(selector, options = {}) {
    let element;
    
    // Try different ways to find the element
    if (selector.startsWith('#')) {
        element = document.getElementById(selector.substring(1));
    } else if (selector.startsWith('.')) {
        element = document.querySelector(selector);
    } else {
        // Try ID first, then class, then selector
        element = document.getElementById(selector) || 
                 document.querySelector('.' + selector) || 
                 document.querySelector(selector);
    }
    
    if (!element) {
        console.warn(`Element '${selector}' not found for scrolling`);
        return false;
    }
    
    const defaultOptions = {
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
    };
    
    const scrollOptions = { ...defaultOptions, ...options };
    
    // Add a small delay to ensure DOM is ready and element is visible
    setTimeout(() => {
        element.scrollIntoView(scrollOptions);
    }, 100);
    
    return true;
}

// Focus management for accessibility
function focusElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        setTimeout(() => {
            element.focus();
            // Add visual indicator if needed
            element.style.outline = '2px solid #6b99c2';
            setTimeout(() => {
                element.style.outline = '';
            }, 2000);
        }, 200);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Load manifest first
    await loadSiteManifest();
    
    // Inject favicons first - this should happen on all pages
    injectFavicons();
    
    const pageType = getCurrentPageType();
    const isAuthenticated = isUserAuthenticated();
    
    // Check access for dashboard pages only
    if (pageType === 'dashboard' && isAuthenticated) {
        checkPageAccess();
    }
    
    // Always inject unified top navigation
    injectTopNavigation();
    
    // Only inject these elements for dashboard pages with authenticated users
    if (pageType === 'dashboard' && isAuthenticated) {
        injectContactForm();
        setupContactForm();
    }
});

function injectFavicons() {
    const head = document.head;
    
    // Remove any existing favicons first
    const existingFavicons = head.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]');
    existingFavicons.forEach(link => link.remove());
    
    // Favicon links to inject
    const faviconLinks = [
        { rel: 'icon', type: 'image/x-icon', href: '/assets/images/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/assets/images/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/assets/images/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/assets/images/apple-touch-icon.png' },
        { rel: 'manifest', href: '/assets/images/site.webmanifest' }
    ];
    
    // Create and append favicon links
    faviconLinks.forEach(linkData => {
        const link = document.createElement('link');
        Object.keys(linkData).forEach(attr => {
            link.setAttribute(attr, linkData[attr]);
        });
        head.appendChild(link);
    });
}

// Generate breadcrumb navigation based on current path
function generateBreadcrumbs() {
    const currentPath = window.location.pathname;
    const pathParts = currentPath.split('/').filter(part => part.length > 0);
    
    let breadcrumbs = '<a href="/" class="nav-item">Home</a>';
    let accumulatedPath = '';
    
    // Known path mappings for better breadcrumb labels
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
        'network': 'Traffic Network',
        'FAQ': 'FAQ',
        'glossary': 'Glossary',
        'scenarios': 'Scenarios'
    };
    
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        accumulatedPath += '/' + part;
        
        // Get a friendly label for this path part
        const label = pathLabels[part] || part.charAt(0).toUpperCase() + part.slice(1);
        
        // Check if this is the last part (current page)
        if (i === pathParts.length - 1) {
            // Current page - no link, different style
            breadcrumbs += ` <span class="breadcrumb-separator">›</span> <span class="nav-item current">${label}</span>`;
        } else {
            // Parent directory - make it a link
            breadcrumbs += ` <span class="breadcrumb-separator">›</span> <a href="${accumulatedPath}/" class="nav-item">${label}</a>`;
        }
    }
    
    return breadcrumbs;
}

// Simplified bottom menu with original styling - replace buildBottomMenu() function
function buildBottomMenu() {
    if (!SITE_MANIFEST) return '';
    
    const currentPage = getCurrentPageInfo();
    const userAccessLevel = getUserAccessLevel();
    const isAuthenticated = isUserAuthenticated();
    
    console.log('Building bottom menu:', { currentPage, userAccessLevel, isAuthenticated });
    
    // Helper function to determine if page is accessible
    const isAccessible = (path) => {
        if (!isAuthenticated) return false;
        const pageInfo = SITE_MANIFEST.pages[path];
        return !pageInfo || userAccessLevel >= pageInfo.accessLevel;
    };
    
    let menuHTML = '';
    
    // Dashboard
    const dashboardNav = SITE_MANIFEST.navigation?.dashboard;
    if (dashboardNav && isAccessible(dashboardNav.path)) {
        const isActive = currentPage.category === 'dashboard';
        menuHTML += `
            <a href="${dashboardNav.path}" class="bottom-menu-item ${isActive ? 'active' : ''}">
                <span class="menu-label">${dashboardNav.label}</span>
            </a>
        `;
    }
    
    // All Simulations as individual links
    const simulatorsNav = SITE_MANIFEST.navigation?.simulators;
    if (simulatorsNav?.children) {
        const accessibleSims = simulatorsNav.children.filter(child => isAccessible(child.path));
        console.log('Accessible simulations:', accessibleSims.length, accessibleSims);
        
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
    const toolsNav = SITE_MANIFEST.navigation?.tools;
    if (toolsNav?.children) {
        const accessibleTools = toolsNav.children.filter(child => isAccessible(child.path));
        console.log('Accessible tools:', accessibleTools.length, accessibleTools);
        
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
    const supportNav = SITE_MANIFEST.navigation?.support;
    if (supportNav?.children) {
        const accessibleSupport = supportNav.children.filter(child => isAccessible(child.path));
        console.log('Accessible support:', accessibleSupport.length, accessibleSupport);
        
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
    const accountsNav = SITE_MANIFEST.navigation?.accounts;
    if (accountsNav && isAccessible(accountsNav.path)) {
        const isActive = currentPage.category === 'account';
        menuHTML += `
            <a href="${accountsNav.path}" class="bottom-menu-item ${isActive ? 'active' : ''}">
                <span class="menu-label">${accountsNav.label}</span>
            </a>
        `;
    }
    
    console.log('Generated menu HTML length:', menuHTML.length);
    return menuHTML;
}

// Inject CSS styles for bottom menu
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
    `;
    document.head.appendChild(style);
}

// Clean injectTopNavigation without dropdown setup
function injectTopNavigation() {
    const pageType = getCurrentPageType();
    const isAuthenticated = isUserAuthenticated();
    
    const topNav = document.createElement('nav');
    topNav.className = 'top-nav';
    
    // Breadcrumbs
    let breadcrumbs;
    if (pageType === 'home') {
        breadcrumbs = '<span class="nav-item current">Home</span>';
    } else if (pageType === 'login') {
        breadcrumbs = '<a href="/" class="nav-item">Home</a> <span class="breadcrumb-separator">›</span> <span class="nav-item current">Sign In</span>';
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
                    <button class="nav-button secondary" onclick="logout()">Logout</button>
                ` : `
                    <a href="/login/" class="nav-button primary">Login</a>
                    ${pageType === 'home' ? '<a href="#contact" class="nav-button secondary">Contact</a>' : ''}
                `}
            </div>
        </div>
        ${isAuthenticated || pageType === 'home' ? `
        <div class="bottom-menu-container">
            <div class="bottom-menu">
                ${bottomMenu}
                ${!isAuthenticated && pageType === 'home' ? `
                    <a href="/login/" class="bottom-menu-item">
                        <span class="menu-label">Login</span>
                    </a>
                    <a href="#contact" class="bottom-menu-item">
                        <span class="menu-label">Contact</span>
                    </a>
                ` : ''}
            </div>
        </div>
        ` : ''}
    `;
    
    document.body.insertBefore(topNav, document.body.firstChild);
    
    // Inject CSS and setup mobile navigation
    injectBottomMenuCSS();
    setupMobileNavigation();
}

function getUserDisplayName() {
    try {
        const displayName = localStorage.getItem('userDisplayName');
        if (displayName) return displayName;
        
        const token = localStorage.getItem('authToken');
        if (!token) return 'User';
        
        const decoded = atob(token);
        const [timestamp, username] = decoded.split(':');
        return username || 'User';
    } catch {
        return 'User';
    }
}

function setupMobileNavigation() {
    const mobileToggle = document.getElementById('mobileNavToggle');
    if (!mobileToggle) return;
    
    // Create mobile navigation overlay
    const overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';
    overlay.id = 'mobileNavOverlay';
    
    const menu = document.createElement('div');
    menu.className = 'mobile-nav-menu';
    overlay.appendChild(menu);
    
    document.body.appendChild(overlay);
    
    // Toggle mobile menu
    mobileToggle.addEventListener('click', function() {
        const isActive = overlay.classList.contains('active');
        
        if (isActive) {
            closeMobileNav();
        } else {
            openMobileNav();
        }
    });
    
    // Close when clicking outside menu
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeMobileNav();
        }
    });
    
    // Close on window resize if switching to desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            closeMobileNav();
        }
    });
    
    function openMobileNav() {
        overlay.classList.add('active');
        mobileToggle.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Populate menu with navigation items
        populateMobileMenu(menu);
    }
    
    function closeMobileNav() {
        overlay.classList.remove('active');
        mobileToggle.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    function populateMobileMenu(menu) {
        if (!SITE_MANIFEST) return;
        
        const currentPage = getCurrentPageInfo();
        const userAccessLevel = getUserAccessLevel();
        const isAuthenticated = isUserAuthenticated();
        
        let menuHTML = `
            <div style="padding: 20px; border-bottom: 1px solid #e9ecef; background: #f8f9fa;">
                <div style="font-weight: 600; color: #354e8d; font-size: 1.1rem;">Navigation</div>
                <div style="font-size: 0.85rem; color: #6c757d; margin-top: 4px;">
                    ${isAuthenticated ? `Welcome, ${getUserDisplayName()}` : 'Guest User'}
                </div>
            </div>
            <div style="padding: 20px;">
        `;
        
        if (!isAuthenticated) {
            menuHTML += `
                <a href="/login/" style="display: block; padding: 12px 0; color: #354e8d; text-decoration: none; font-weight: 600; border-bottom: 1px solid #f0f0f0;">
                    Login
                </a>
                <a href="/" style="display: block; padding: 12px 0; color: #354e8d; text-decoration: none; font-weight: 600; border-bottom: 1px solid #f0f0f0;">
                    Home
                </a>
            `;
        } else {
            // Dashboard link
            const dashboardNav = SITE_MANIFEST.navigation?.dashboard;
            if (dashboardNav) {
                menuHTML += `
                    <a href="${dashboardNav.path}" style="display: block; padding: 12px 0; color: #354e8d; text-decoration: none; font-weight: 600; border-bottom: 1px solid #f0f0f0;">
                        ${dashboardNav.label}
                    </a>
                `;
            }
        }
        
        // Simulations
        const simulatorsNav = SITE_MANIFEST.navigation?.simulators;
        if (simulatorsNav) {
            menuHTML += `
                <div style="margin: 20px 0 10px 0; font-weight: 600; color: #6c757d; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">
                    Simulations
                </div>
            `;
            
            simulatorsNav.children?.forEach(child => {
                const isAccessible = isAuthenticated && userAccessLevel >= child.accessLevel;
                const levelInfo = !isAuthenticated ? ' (Login Required)' : 
                                  !isAccessible ? ` (Level ${child.accessLevel})` : '';
                const style = isAccessible ? 
                    'display: block; padding: 10px 0; color: #495057; text-decoration: none; border-bottom: 1px solid #f8f9fa;' :
                    'display: block; padding: 10px 0; color: #adb5bd; text-decoration: none; border-bottom: 1px solid #f8f9fa; cursor: not-allowed;';
                
                const clickHandler = !isAccessible ? (!isAuthenticated ? 'window.location.href="/login/"' : 'event.preventDefault()') : '';
                
                menuHTML += `
                    <a href="${child.path}" style="${style}" ${!isAccessible ? `onclick="${clickHandler}"` : ''}>
                        ${child.label}${levelInfo}
                    </a>
                `;
            });
        }
        
        // Tools
        const toolsNav = SITE_MANIFEST.navigation?.tools;
        if (toolsNav) {
            menuHTML += `
                <div style="margin: 20px 0 10px 0; font-weight: 600; color: #6c757d; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">
                    Tools
                </div>
            `;
            
            toolsNav.children?.forEach(child => {
                const isAccessible = isAuthenticated && userAccessLevel >= child.accessLevel;
                const levelInfo = !isAuthenticated ? ' (Login Required)' : 
                                  !isAccessible ? ` (Level ${child.accessLevel})` : '';
                const style = isAccessible ? 
                    'display: block; padding: 10px 0; color: #495057; text-decoration: none; border-bottom: 1px solid #f8f9fa;' :
                    'display: block; padding: 10px 0; color: #adb5bd; text-decoration: none; border-bottom: 1px solid #f8f9fa; cursor: not-allowed;';
                
                const clickHandler = !isAccessible ? (!isAuthenticated ? 'window.location.href="/login/"' : 'event.preventDefault()') : '';
                
                menuHTML += `
                    <a href="${child.path}" style="${style}" ${!isAccessible ? `onclick="${clickHandler}"` : ''}>
                        ${child.label}${levelInfo}
                    </a>
                `;
            });
        }
        
        // Support
        const supportNav = SITE_MANIFEST.navigation?.support;
        if (supportNav?.children) {
            menuHTML += `
                <div style="margin: 20px 0 10px 0; font-weight: 600; color: #6c757d; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">
                    Support
                </div>
            `;
            
            supportNav.children.forEach(child => {
                const isAccessible = isAuthenticated && userAccessLevel >= child.accessLevel;
                const levelInfo = !isAuthenticated ? ' (Login Required)' : 
                                  !isAccessible ? ` (Level ${child.accessLevel})` : '';
                const style = isAccessible ? 
                    'display: block; padding: 10px 0; color: #495057; text-decoration: none; border-bottom: 1px solid #f8f9fa;' :
                    'display: block; padding: 10px 0; color: #adb5bd; text-decoration: none; border-bottom: 1px solid #f8f9fa; cursor: not-allowed;';
                
                const clickHandler = !isAccessible ? (!isAuthenticated ? 'window.location.href="/login/"' : 'event.preventDefault()') : '';
                
                menuHTML += `
                    <a href="${child.path}" style="${style}" ${!isAccessible ? `onclick="${clickHandler}"` : ''}>
                        ${child.label}${levelInfo}
                    </a>
                `;
            });
        }
        
        // Account
        const accountsNav = SITE_MANIFEST.navigation?.accounts;
        if (accountsNav) {
            const isAccessible = isAuthenticated && userAccessLevel >= accountsNav.accessLevel;
            const levelInfo = !isAuthenticated ? ' (Login Required)' : 
                              !isAccessible ? ` (Level ${accountsNav.accessLevel})` : '';
            const style = isAccessible ? 
                'display: block; padding: 12px 0; color: #354e8d; text-decoration: none; font-weight: 600; border-bottom: 1px solid #f0f0f0; margin-top: 20px;' :
                'display: block; padding: 12px 0; color: #adb5bd; text-decoration: none; font-weight: 600; border-bottom: 1px solid #f0f0f0; margin-top: 20px; cursor: not-allowed;';
            
            const clickHandler = !isAccessible ? (!isAuthenticated ? 'window.location.href="/login/"' : 'event.preventDefault()') : '';
            
            menuHTML += `
                <a href="${accountsNav.path}" style="${style}" ${!isAccessible ? `onclick="${clickHandler}"` : ''}>
                    ${accountsNav.label}${levelInfo}
                </a>
            `;
        }
        
        menuHTML += `
            </div>
            <div style="padding: 20px; border-top: 1px solid #e9ecef; background: #f8f9fa;">
                ${isAuthenticated ? `
                    <button onclick="logout()" style="width: 100%; padding: 12px; background: #6b99c2; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
                        Logout
                    </button>
                ` : `
                    <a href="/login/" style="display: block; width: 100%; padding: 12px; background: #6b99c2; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; text-align: center; box-sizing: border-box;">
                        Login
                    </a>
                `}
            </div>
        `;
        
        menu.innerHTML = menuHTML;
        
        // Add click handlers for menu links
        menu.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && !link.onclick) {
                closeMobileNav();
            }
        });
    }
}

function isValidToken(token) {
    try {
        const decoded = atob(token);
        const [timestamp, username, accessLevel] = decoded.split(':');
        const tokenAge = Date.now() - parseInt(timestamp);
        const expiryHours = SITE_MANIFEST?.settings?.tokenExpiry || 24;
        return tokenAge < expiryHours * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

function getUserAccessLevel() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return 0;
        
        const decoded = atob(token);
        const [timestamp, username, accessLevel] = decoded.split(':');
        return parseInt(accessLevel) || 0;
    } catch {
        return 0;
    }
}

function checkPageAccess() {
    if (!SITE_MANIFEST) return;
    
    const currentPath = window.location.pathname;
    const userAccessLevel = getUserAccessLevel();
    const pageInfo = SITE_MANIFEST.pages[currentPath];
    
    // Skip access check for login page or if no page info found
    if (currentPath === '/login/' || currentPath === '/public/login/' || !pageInfo) {
        return;
    }
    
    // Check if user has sufficient access level
    if (userAccessLevel < pageInfo.accessLevel) {
        showAccessDeniedOverlay(currentPath, pageInfo.accessLevel, userAccessLevel);
    }
}

function showAccessDeniedOverlay(currentPath, requiredLevel, userLevel) {
    if (!SITE_MANIFEST) return;
    
    // Create overlay
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
    
    // Create modal
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
    
    const pageInfo = SITE_MANIFEST.pages[currentPath];
    const pageName = pageInfo?.name || 'This page';
    const requiredLevelInfo = SITE_MANIFEST.accessLevels[requiredLevel];
    const userLevelInfo = SITE_MANIFEST.accessLevels[userLevel];
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
    
    // Add CSS animation
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
    
    // Disable page interactions
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    overlay.style.pointerEvents = 'all';
    
    // Prevent escape key and other ways to close
    const preventEscape = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    
    document.addEventListener('keydown', preventEscape);
    document.addEventListener('contextmenu', preventEscape);
    
    // Make returnToDashboard globally available
    window.returnToDashboard = function() {
        window.location.href = '/traffic/';
    };
}

function getCurrentPageInfo() {
    if (!SITE_MANIFEST) return { category: null, page: null };
    
    const path = window.location.pathname;
    
    // Check each navigation category to find where this path belongs
    const nav = SITE_MANIFEST.navigation;
    
    // Check dashboard
    if (nav.dashboard && path === nav.dashboard.path) {
        return { category: 'dashboard', page: 'dashboard' };
    }
    
    // Check simulators
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
    
    // Check tools
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
    
    // Check support
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
    
    // Check accounts
    if (nav.accounts && path === nav.accounts.path) {
        return { category: 'account', page: 'account' };
    }
    
    return { category: null, page: null };
}

function injectContactForm() {
    // Find the main container - try multiple selectors
    let container = document.querySelector('.container');
    if (!container) return;

    // Create compact contact form
    const contactSection = document.createElement('div');
    contactSection.className = 'compact-contact-section';
    contactSection.innerHTML = `
        <div class="compact-contact-form">
            <h4>💬 Have a feature suggestion or found an issue?</h4>
            <form id="compactFeedbackForm">
                <div class="compact-form-row">
                    <select id="compactFeedbackType" name="feedbackType" required>
                        <option value="">Select feedback type...</option>
                        <option value="bug">🐛 Bug Report</option>
                        <option value="feature">✨ Feature Request</option>
                        <option value="improvement">🔧 Improvement</option>
                        <option value="other">💭 Other</option>
                    </select>
                    <input type="email" id="compactEmail" name="email" placeholder="📧 Email (optional)">
                </div>
                <textarea id="compactMessage" name="message" placeholder="💬 Your feedback..." required></textarea>
                <div class="compact-form-footer">
                    <button type="submit" class="compact-submit-btn">Send Feedback</button>
                    <div class="compact-status" id="compactStatus" style="display: none;"></div>
                </div>
            </form>
        </div>
    `;

    // Append to container
    container.appendChild(contactSection);
}

function setupContactForm() {
    // Wait a bit for the form to be injected
    setTimeout(() => {
        const form = document.getElementById('compactFeedbackForm');
        const submitBtn = form?.querySelector('.compact-submit-btn');
        const statusDiv = document.getElementById('compactStatus');

        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const feedbackData = {
                feedbackType: formData.get('feedbackType'),
                email: formData.get('email') || 'Not provided',
                message: formData.get('message'),
                timestamp: new Date().toISOString(),
                page: document.title || 'Unknown page',
                url: window.location.href,
                userAccessLevel: getUserAccessLevel()
            };

            // Validate
            if (!feedbackData.feedbackType || !feedbackData.message.trim()) {
                showCompactStatus('Please fill in required fields.', 'error');
                return;
            }

            // Submit
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            statusDiv.style.display = 'none';

            try {
                const success = await sendCompactFeedback(feedbackData);
                if (success) {
                    showCompactStatus('✅ Feedback sent successfully!', 'success');
                    form.reset();
                } else {
                    showCompactStatus('❌ Failed to send. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Form submission error:', error);
                showCompactStatus('⚠️ An error occurred. Please try again.', 'error');
            }

            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Feedback';
        });
    }, 100);
}

// Updated to use secure API endpoint
async function sendCompactFeedback(data) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/sendform', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result.success;
    } catch (error) {
        console.error('Feedback submission error:', error);
        return false;
    }
}

function showCompactStatus(message, type) {
    const statusDiv = document.getElementById('compactStatus');
    if (!statusDiv) return;
    
    statusDiv.textContent = message;
    statusDiv.className = `compact-status ${type}`;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 4000);
    }
}

// Make logout function globally available
window.logout = function() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userAccessLevel');
    localStorage.removeItem('userDisplayName');
    window.location.href = '/login/';
};

// Common utility functions for simulations
function formatScientific(num) {
    if (num === 0) return "0";
    
    const exponent = Math.floor(Math.log10(Math.abs(num)));
    const mantissa = num / Math.pow(10, exponent);
    
    // Round to 2 significant figures
    const rounded = Math.round(mantissa * 10) / 10;
    
    return `${rounded.toFixed(1)} × 10^${exponent}`;
}

function formatTime(milliseconds) {
    const seconds = Math.ceil(milliseconds / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const remainingMinutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${remainingMinutes}m`;
    }
}

function getZScoreForConfidence(confidenceLevel) {
    const zScores = {
        90: 1.645,
        95: 1.96,
        99: 2.576,
        99.9: 3.291,
        99.99: 3.891
    };
    return zScores[confidenceLevel] || 1.96;
}

function createAccurateProgressTracker(totalSeeds, seedTimeMs, averagingTimeMs, completedSeeds = 1) {
    const startTime = Date.now();
    const remainingSeeds = totalSeeds - completedSeeds;
    const simulationPhaseTime = seedTimeMs * remainingSeeds;
    const totalEstimatedTime = simulationPhaseTime + averagingTimeMs;
    
    return {
        update: function() {
            const elapsed = Date.now() - startTime;
            
            // Determine phase and calculate progress
            if (elapsed < simulationPhaseTime) {
                // Simulation phase (remaining seeds)
                const simulationProgress = elapsed / simulationPhaseTime;
                const additionalSeedsCompleted = Math.floor(simulationProgress * remainingSeeds);
                const totalSeedsCompleted = completedSeeds + additionalSeedsCompleted;
                const percentage = Math.min((totalSeedsCompleted / totalSeeds) * 100, 95);
                const remainingTime = simulationPhaseTime - elapsed + averagingTimeMs;
                
                return {
                    phase: 'simulation',
                    percentage: percentage,
                    currentSeed: totalSeedsCompleted,
                    totalSeeds: totalSeeds,
                    remainingTimeMs: Math.max(0, remainingTime),
                    elapsed: elapsed
                };
            } else {
                // Averaging phase
                const averagingProgress = (elapsed - simulationPhaseTime) / averagingTimeMs;
                const percentage = Math.min(95 + (averagingProgress * 5), 99); // 95% to 99%
                const remainingTime = totalEstimatedTime - elapsed;
                
                return {
                    phase: 'averaging',
                    percentage: percentage,
                    currentSeed: totalSeeds,
                    totalSeeds: totalSeeds,
                    remainingTimeMs: Math.max(0, remainingTime),
                    elapsed: elapsed
                };
            }
        },
        
        forceComplete: function() {
            return {
                phase: 'complete',
                percentage: 100,
                currentSeed: totalSeeds,
                totalSeeds: totalSeeds,
                remainingTimeMs: 0,
                elapsed: Date.now() - startTime
            };
        }
    };
}

function generateValidationSection(results, params, marginError, validationTitle = 'Arrival Rate Validation') {
    // This function can be customized by each simulation page
    return `
        <div class="validation-section">
            <h4>✅ ${validationTitle}</h4>
            <ul class="validation-list">
                <li><strong>Status:</strong> Validation completed</li>
            </ul>
        </div>
    `;
}

// Centralized simulation runtime estimation
function estimateSimulationRuntime(parameters) {
    const currentPath = window.location.pathname;
    let estimatedSeconds = 5; // Default fallback
    
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
            console.warn(`No runtime estimation for page: ${currentPath}`);
            estimatedSeconds = 5;
    }
    
    // Convert to milliseconds and apply bounds
    const estimatedMs = Math.max(500, Math.min(300000, estimatedSeconds * 1000));
    
    console.log(`Estimated runtime for ${currentPath}: ${estimatedSeconds.toFixed(2)}s (${estimatedMs}ms)`);
    return estimatedMs;
}

function estimateCarLiftRuntime(parameters) {
    // Calculate total arrivals
    let totalArrivals = 0;
    for (let f = 1; f <= parameters.numFloors; f++) {
        if (f === parameters.lobbyFloor) continue;
        totalArrivals += (parameters.arrivalRates[f] || 0);
        totalArrivals += (parameters.departureRates[f] || 0);
    }
    
    // Formula: arrivals * hours * seeds * 0.000002 + 0.8
    const estimatedSeconds = (totalArrivals * parameters.simHours * parameters.numSeeds * 0.000002) + 0.8;
    return Math.max(0.8, estimatedSeconds); // Minimum 0.8 seconds (base time)
}

function estimateBoomGateRuntime(parameters) {
    // Calculate total arrivals
    const arrivalRate = parameters.arrivalRate || 0;
    const simHours = parameters.simulationHours || parameters.simHours || 1;
    const numSeeds = parameters.numSeeds || 100;
    
    // Formula: arrivals * hours * seeds * 0.000006 + 1.3
    const estimatedSeconds = (arrivalRate * simHours * numSeeds * 0.00000122) + 1.3;
    return Math.max(1.3, estimatedSeconds); // Minimum 1.3 seconds (base time)
}

function estimateTwoWayPassingRuntime(parameters) {
    // Placeholder - adjust based on two-way passing simulation complexity
    const arrivalRate = parameters.arrivalRate || 30;
    const simHours = parameters.simHours || 1000;
    const numSeeds = parameters.numSeeds || 100;
    
    return (arrivalRate * simHours * numSeeds * 0.0000008) + 0.4;
}

function estimateSchoolPickupRuntime(parameters) {
    // School pickup simulation - typically involves multiple pickup points and stochastic arrival patterns
    const arrivalRate = parameters.arrivalRate || parameters.peakArrivalRate || 25;
    const simHours = parameters.simHours || parameters.simulationHours || 1000;
    const numSeeds = parameters.numSeeds || 100;
    
    // School pickup simulations tend to be more complex due to multiple pickup zones
    // and varying service patterns, so slightly higher coefficient
    const estimatedSeconds = (arrivalRate * simHours * numSeeds * 0.000001) + 0.9;
    return Math.max(0.9, estimatedSeconds); // Minimum 0.9 seconds (base time)
}

function estimateCarParkRuntime(parameters) {
    // Use arrival rate instead of spaces - arrival rate drives computational complexity
    const arrivalRate = parameters.arrivalRate || 35;
    const simHours = parameters.simHours || 1000;
    const numSeeds = parameters.numSeeds || 100;
    
    // Formula: arrival rate * hours * seeds * coefficient + base time
    const estimatedSeconds = (arrivalRate * simHours * numSeeds * 0.00000224) + 0.6;
    return Math.max(0.6, estimatedSeconds); // Minimum 0.6 seconds (base time)
}

function estimateMechanicalRuntime(parameters) {
    // Use total arrival rate (entry + exit) - this drives computational complexity
    const entryRate = parameters.entryRate || 15;
    const exitRate = parameters.exitRate || 15; 
    const totalRate = entryRate + exitRate;
    const simHours = parameters.simHours || parameters.simulationHours || 1000;
    const numSeeds = parameters.numSeeds || 100;
    
    // Adjusted coefficient to fix 60x underestimation: rate * hours * seeds * coefficient + base
    const estimatedSeconds = (totalRate * simHours * numSeeds * 0.00000115) + 0.75;
    return Math.max(0.75, estimatedSeconds); // Minimum 0.75 seconds (base time)
}

// Format time for display
function formatEstimatedTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    return `${(ms/60000).toFixed(1)}m`;
}

// Create accurate progress animation that follows the estimate closely
function createRealisticProgress(estimatedMs, progressFill, progressPercentage, progressDetails) {
    let startTime = Date.now();
    
    const progressPhases = [
        { start: 85, end: 95, message: 'Calculating statistics...' },
        { start: 95, end: 100, message: 'Finalizing results...' }
    ];
    
    const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const rawProgress = Math.min(95, (elapsed / estimatedMs) * 100);
        
        // Add minimal smoothing (±1%) to avoid jerkiness
        const smoothedProgress = rawProgress + (Math.random() - 0.5) * 2;
        const progress = Math.max(0, Math.min(95, smoothedProgress));
        
        // Find current phase
        let currentPhase = progressPhases[0];
        for (const phase of progressPhases) {
            if (progress >= phase.start && progress < phase.end) {
                currentPhase = phase;
                break;
            }
        }
        
        progressFill.style.width = progress + '%';
        progressPercentage.textContent = Math.round(progress) + '%';
        progressDetails.textContent = currentPhase.message;
        
        // Continue until we reach 95% (server completes the rest)
        return progress < 95;
    };
    
    const interval = setInterval(updateProgress, 150);
    
    return interval;
}

// Optional: Update runtime estimate display when parameters change
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