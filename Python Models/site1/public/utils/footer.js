// footer.js - Site footer with sitemap navigation

import { getSiteManifest } from './manifest.js';
import { isUserAuthenticated, getUserAccessLevel } from './auth.js';

/**
 * Injects the footer sitemap into the page
 */
function injectFooter() {
    // Check if footer already exists
    if (document.getElementById('site-footer')) {
        return;
    }

    const footer = createFooterElement();
    document.body.appendChild(footer);
}

/**
 * Creates the footer element with all sections
 */
function createFooterElement() {
    const manifest = getSiteManifest();
    const isAuthenticated = isUserAuthenticated();
    const userAccessLevel = getUserAccessLevel();

    const footer = document.createElement('footer');
    footer.id = 'site-footer';
    footer.className = 'site-footer';

    footer.innerHTML = `
        <div class="footer-container">
            <div class="footer-grid">
                <!-- Company Section -->
                <div class="footer-column">
                    <h3 class="footer-heading">Traffic Labb</h3>
                    <p class="footer-description">
                        Professional-grade traffic engineering simulations and design tools for infrastructure excellence.
                    </p>
                    <p class="footer-abn">
                        ABN: 17 608 847 347
                    </p>
                    <div class="footer-social">
                        <a href="mailto:traffic@thelabb.com.au" class="footer-social-link" aria-label="Email">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                            </svg>
                        </a>
                        <a href="tel:+61432866183" class="footer-social-link" aria-label="Phone">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                            </svg>
                        </a>
                    </div>
                </div>

                ${createSimulatorsColumn(manifest, isAuthenticated, userAccessLevel)}
                ${createToolsColumn(manifest, isAuthenticated, userAccessLevel)}
                ${createSupportColumn(manifest, isAuthenticated, userAccessLevel)}
                ${createQuickLinksColumn(isAuthenticated)}
            </div>

            <div class="footer-bottom">
                <div class="footer-bottom-content">
                    <p class="footer-copyright">
                        &copy; ${new Date().getFullYear()} Traffic Labb. All rights reserved.
                    </p>
                    <div class="footer-bottom-links">
                        <a href="/privacy/" class="footer-bottom-link">Privacy Policy</a>
                        <span class="footer-separator">|</span>
                        <a href="/terms/" class="footer-bottom-link">Terms of Service</a>
                        <span class="footer-separator">|</span>
                        <a href="/contact/" class="footer-bottom-link">Contact</a>
                    </div>
                </div>
            </div>
        </div>
    `;

    return footer;
}

/**
 * Creates the Simulations column
 */
function createSimulatorsColumn(manifest, isAuthenticated, userAccessLevel) {
    const simulatorsNav = manifest?.navigation?.simulators;
    if (!simulatorsNav) return '';

    const linksHTML = simulatorsNav.children
        ?.filter(child => !isAuthenticated || userAccessLevel >= child.accessLevel)
        .map(child => `
            <li>
                <a href="${child.path}" class="footer-link">
                    ${child.label}
                </a>
            </li>
        `).join('') || '';

    return `
        <div class="footer-column">
            <h3 class="footer-heading">Simulations</h3>
            <ul class="footer-links">
                ${linksHTML}
                <li>
                    <a href="${simulatorsNav.path}" class="footer-link footer-link-all">
                        View All Simulations →
                    </a>
                </li>
            </ul>
        </div>
    `;
}

/**
 * Creates the Tools column
 */
function createToolsColumn(manifest, isAuthenticated, userAccessLevel) {
    const toolsNav = manifest?.navigation?.tools;
    if (!toolsNav) return '';

    const linksHTML = toolsNav.children
        ?.filter(child => !isAuthenticated || userAccessLevel >= child.accessLevel)
        .map(child => `
            <li>
                <a href="${child.path}" class="footer-link">
                    ${child.label}
                </a>
            </li>
        `).join('') || '';

    return `
        <div class="footer-column">
            <h3 class="footer-heading">Tools</h3>
            <ul class="footer-links">
                ${linksHTML}
                <li>
                    <a href="${toolsNav.path}" class="footer-link footer-link-all">
                        View All Tools →
                    </a>
                </li>
            </ul>
        </div>
    `;
}

/**
 * Creates the Support column
 */
function createSupportColumn(manifest, isAuthenticated, userAccessLevel) {
    const supportNav = manifest?.navigation?.support;
    if (!supportNav) return '';

    const linksHTML = supportNav.children
        ?.filter(child => !isAuthenticated || userAccessLevel >= child.accessLevel)
        .map(child => `
            <li>
                <a href="${child.path}" class="footer-link">
                    ${child.label}
                </a>
            </li>
        `).join('') || '';

    return `
        <div class="footer-column">
            <h3 class="footer-heading">Support</h3>
            <ul class="footer-links">
                ${linksHTML}
                <li>
                    <a href="${supportNav.path}" class="footer-link footer-link-all">
                        Support Center →
                    </a>
                </li>
            </ul>
        </div>
    `;
}

/**
 * Creates the Quick Links column
 */
function createQuickLinksColumn(isAuthenticated) {
    return `
        <div class="footer-column">
            <h3 class="footer-heading">Quick Links</h3>
            <ul class="footer-links">
                <li>
                    <a href="/" class="footer-link">Home</a>
                </li>
                <li>
                    <a href="/traffic/" class="footer-link">Dashboard</a>
                </li>
                ${isAuthenticated ? `
                    <li>
                        <a href="/account/" class="footer-link">Account Settings</a>
                    </li>
                ` : `
                    <li>
                        <a href="/login/" class="footer-link">Login</a>
                    </li>
                `}
                <li>
                    <a href="/contact/" class="footer-link">Contact Us</a>
                </li>
                <li>
                    <a href="/about/" class="footer-link">About</a>
                </li>
            </ul>
        </div>
    `;
}

/**
 * Injects footer styles into the page
 */
function injectFooterStyles() {
    // Check if styles already exist
    if (document.getElementById('footer-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'footer-styles';
    style.textContent = `
        .site-footer {
            background: linear-gradient(135deg, #2c3e50 0%, #354e8d 100%);
            color: #ffffff;
            padding: 40px 0 0;
            margin-top: 60px;
            border-top: 4px solid #6b99c2;
        }

        .footer-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 20px;
        }

        .footer-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 20px;
            padding-bottom: 30px;
        }

        .footer-column {
            min-width: 0;
        }

        .footer-heading {
            color: #87ceeb;
            font-size: 1rem;
            font-weight: 700;
            margin-bottom: 15px;
            letter-spacing: 0.3px;
        }

        .footer-description {
            color: rgba(255, 255, 255, 0.8);
            line-height: 1.5;
            margin-bottom: 10px;
            font-size: 0.85rem;
        }

        .footer-abn {
            color: rgba(255, 255, 255, 0.7);
            font-size: 0.8rem;
            margin-bottom: 15px;
            font-weight: 500;
        }

        .footer-social {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        .footer-social-link {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            color: #ffffff;
            transition: all 0.3s ease;
            text-decoration: none;
        }

        .footer-social-link:hover {
            background: #87ceeb;
            color: #2c3e50;
            transform: translateY(-2px);
        }

        .footer-links {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .footer-links li {
            margin-bottom: 8px;
        }

        .footer-link {
            color: rgba(255, 255, 255, 0.8);
            text-decoration: none;
            transition: all 0.3s ease;
            display: inline-block;
            font-size: 0.85rem;
            position: relative;
        }

        .footer-link:hover {
            color: #87ceeb;
            padding-left: 5px;
        }

        .footer-link-all {
            color: #87ceeb;
            font-weight: 600;
            margin-top: 4px;
        }

        .footer-link-all:hover {
            color: #ffffff;
        }

        .footer-bottom {
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            padding: 20px 0;
            margin-top: 10px;
        }

        .footer-bottom-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }

        .footer-copyright {
            color: rgba(255, 255, 255, 0.7);
            margin: 0;
            font-size: 0.85rem;
        }

        .footer-bottom-links {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .footer-bottom-link {
            color: rgba(255, 255, 255, 0.7);
            text-decoration: none;
            transition: color 0.3s ease;
            font-size: 0.85rem;
        }

        .footer-bottom-link:hover {
            color: #87ceeb;
        }

        .footer-separator {
            color: rgba(255, 255, 255, 0.3);
            font-size: 0.75rem;
        }

        /* Responsive Design */
        @media (max-width: 1200px) {
            .footer-grid {
                grid-template-columns: repeat(3, 1fr);
                gap: 25px;
            }
        }

        @media (max-width: 900px) {
            .footer-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 25px;
            }
        }

        @media (max-width: 768px) {
            .site-footer {
                padding: 30px 0 0;
                margin-top: 50px;
            }

            .footer-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 20px;
            }

            .footer-bottom-content {
                flex-direction: column;
                text-align: center;
            }

            .footer-bottom-links {
                justify-content: center;
            }
        }

        @media (max-width: 480px) {
            .footer-grid {
                grid-template-columns: 1fr;
                gap: 25px;
            }

            .footer-heading {
                font-size: 1rem;
            }

            .footer-link,
            .footer-description {
                font-size: 0.85rem;
            }
        }
    `;

    document.head.appendChild(style);
}

/**
 * Initialize footer on page load
 */
function initializeFooter() {
    injectFooterStyles();
    injectFooter();
}

export {
    injectFooter,
    injectFooterStyles,
    initializeFooter
};
