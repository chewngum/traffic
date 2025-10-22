// ui-utilities.js - UI helper functions (scrolling, focus, favicons)

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

function scrollToElementAdvanced(selector, options = {}) {
    let element;
    
    if (selector.startsWith('#')) {
        element = document.getElementById(selector.substring(1));
    } else if (selector.startsWith('.')) {
        element = document.querySelector(selector);
    } else {
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
    
    setTimeout(() => {
        element.scrollIntoView(scrollOptions);
    }, 100);
    
    return true;
}

function focusElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        setTimeout(() => {
            element.focus();
            element.style.outline = '2px solid #6b99c2';
            setTimeout(() => {
                element.style.outline = '';
            }, 2000);
        }, 200);
    }
}

function injectFavicons() {
    const head = document.head;
    
    const existingFavicons = head.querySelectorAll('link[rel*="icon"], link[rel="manifest"]');
    existingFavicons.forEach(link => link.remove());
    
    const faviconLinks = [
        { rel: 'icon', type: 'image/x-icon', href: '/assets/images/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/assets/images/favicon-16x16.png' },
        { rel: 'manifest', href: '/assets/images/site.webmanifest' }
    ];
    
    faviconLinks.forEach(linkData => {
        const link = document.createElement('link');
        Object.keys(linkData).forEach(attr => {
            link.setAttribute(attr, linkData[attr]);
        });
        head.appendChild(link);
    });
}

export { 
    scrollToElement,
    scrollToProgress,
    scrollToResults,
    scrollToElementAdvanced,
    focusElement,
    injectFavicons
};
