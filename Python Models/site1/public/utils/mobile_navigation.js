// mobile-navigation.js - Mobile navigation menu

import { getSiteManifest } from './manifest.js';
import { isUserAuthenticated, getUserAccessLevel, getUserDisplayName } from './auth.js';
import { getCurrentPageInfo } from './navigation.js';

function setupMobileNavigation() {
    const mobileToggle = document.getElementById('mobileNavToggle');
    if (!mobileToggle) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';
    overlay.id = 'mobileNavOverlay';
    
    const menu = document.createElement('div');
    menu.className = 'mobile-nav-menu';
    overlay.appendChild(menu);
    
    document.body.appendChild(overlay);
    
    mobileToggle.addEventListener('click', function() {
        const isActive = overlay.classList.contains('active');
        
        if (isActive) {
            closeMobileNav();
        } else {
            openMobileNav();
        }
    });
    
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeMobileNav();
        }
    });
    
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            closeMobileNav();
        }
    });
    
    function openMobileNav() {
        overlay.classList.add('active');
        mobileToggle.classList.add('active');
        document.body.style.overflow = 'hidden';
        populateMobileMenu(menu);
    }
    
    function closeMobileNav() {
        overlay.classList.remove('active');
        mobileToggle.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    function populateMobileMenu(menu) {
        const manifest = getSiteManifest();
        if (!manifest) return;
        
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
            const dashboardNav = manifest.navigation?.dashboard;
            if (dashboardNav) {
                menuHTML += `
                    <a href="${dashboardNav.path}" style="display: block; padding: 12px 0; color: #354e8d; text-decoration: none; font-weight: 600; border-bottom: 1px solid #f0f0f0;">
                        ${dashboardNav.label}
                    </a>
                `;
            }
        }
        
        const simulatorsNav = manifest.navigation?.simulators;
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
        
        const toolsNav = manifest.navigation?.tools;
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
        
        const supportNav = manifest.navigation?.support;
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
        
        const accountsNav = manifest.navigation?.accounts;
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
        
        menu.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && !link.onclick) {
                closeMobileNav();
            }
        });
    }
}

export { setupMobileNavigation };
