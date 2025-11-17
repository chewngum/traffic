/**
 * Tooltip Initialization System
 * Automatically applies tooltips to form labels and elements based on tooltip-definitions.js
 *
 * Usage:
 * 1. Include tooltip-definitions.js before this file
 * 2. Call initTooltips() when DOM is ready
 * 3. Optionally call addTooltip(element, key) to manually add tooltips
 */

(function() {
    'use strict';

    /**
     * Normalize text for comparison by removing special characters and converting to lowercase
     */
    function normalizeText(text) {
        return text.trim()
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')  // Remove special chars except hyphens
            .replace(/\s+/g, '-')      // Replace spaces with hyphens
            .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
    }

    /**
     * Find matching tooltip definition for a given label text
     */
    function findTooltipForText(text) {
        if (!window.TOOLTIP_DEFINITIONS) {
            console.warn('TOOLTIP_DEFINITIONS not loaded');
            return null;
        }

        const normalized = normalizeText(text);
        const definitions = window.TOOLTIP_DEFINITIONS;

        // Direct match
        if (definitions[normalized]) {
            return definitions[normalized];
        }

        // Partial match - check if normalized text contains any key
        for (const [key, value] of Object.entries(definitions)) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return value;
            }
        }

        return null;
    }

    /**
     * Add tooltip to an element
     */
    function addTooltip(element, tooltipText, options = {}) {
        if (!element || !tooltipText) return false;

        // Set tooltip content
        element.setAttribute('data-tooltip', tooltipText);

        // Set position if specified
        if (options.position) {
            element.setAttribute('data-tooltip-pos', options.position);
        }

        // Set size if specified
        if (options.size) {
            element.setAttribute('data-tooltip-size', options.size);
        }

        // Add accessible aria-label
        if (!element.getAttribute('aria-label')) {
            element.setAttribute('aria-label', tooltipText);
        }

        return true;
    }

    /**
     * Process a single label element
     */
    function processLabel(label) {
        // Skip if already has tooltip
        if (label.hasAttribute('data-tooltip')) {
            return;
        }

        // Get label text (remove any existing icons or extra content)
        let labelText = label.textContent || label.innerText;

        // Remove common suffixes like ":", "(s)", etc.
        labelText = labelText
            .replace(/\s*:?\s*$/,'')
            .replace(/\s*\([^)]*\)\s*$/g, '');

        // Find matching tooltip
        const tooltipText = findTooltipForText(labelText);

        if (tooltipText) {
            addTooltip(label, tooltipText);
        }
    }

    /**
     * Process table headers
     */
    function processTableHeaders() {
        const headers = document.querySelectorAll('th');

        headers.forEach(th => {
            if (th.hasAttribute('data-tooltip')) return;

            const headerText = th.textContent || th.innerText;
            const tooltipText = findTooltipForText(headerText);

            if (tooltipText) {
                addTooltip(th, tooltipText);
            }
        });
    }

    /**
     * Process row header cells (first column cells that act as labels)
     */
    function processRowHeaders() {
        // Find all tables
        const tables = document.querySelectorAll('table');

        tables.forEach(table => {
            // Find all rows in the table body
            const rows = table.querySelectorAll('tbody tr');

            rows.forEach(row => {
                // Get the first td in each row
                const firstCell = row.querySelector('td:first-child');

                if (firstCell && !firstCell.hasAttribute('data-tooltip')) {
                    const cellText = firstCell.textContent || firstCell.innerText;

                    // Skip numeric-only cells (row numbers in results tables)
                    if (/^\s*\d+\s*$/.test(cellText)) {
                        return;
                    }

                    const tooltipText = findTooltipForText(cellText);

                    if (tooltipText) {
                        addTooltip(firstCell, tooltipText);
                    }
                }
            });
        });
    }

    /**
     * Process select options (add tooltip to parent select)
     */
    function processSelects() {
        const selects = document.querySelectorAll('select');

        selects.forEach(select => {
            if (select.hasAttribute('data-tooltip')) return;

            // Check if select has a preceding label
            const label = select.closest('.form-group')?.querySelector('label');
            if (label) {
                const labelText = label.textContent || label.innerText;
                const tooltipText = findTooltipForText(labelText);

                if (tooltipText && !label.hasAttribute('data-tooltip')) {
                    addTooltip(label, tooltipText);
                }
            }

            // Also check the select's own ID for matches
            if (select.id) {
                const tooltipText = findTooltipForText(select.id);
                if (tooltipText) {
                    addTooltip(select, tooltipText, { position: 'bottom' });
                }
            }
        });
    }

    /**
     * Process elements with specific IDs that match tooltip keys
     */
    function processElementsByID() {
        if (!window.TOOLTIP_DEFINITIONS) return;

        Object.keys(window.TOOLTIP_DEFINITIONS).forEach(key => {
            // Try to find element by ID (with or without hyphens)
            const idVariants = [
                key,
                key.replace(/-/g, ''),
                key.replace(/-/g, '_'),
                key.replace(/-/g, ' ')
            ];

            idVariants.forEach(idVariant => {
                const element = document.getElementById(idVariant);
                if (element && !element.hasAttribute('data-tooltip')) {
                    // Check if it's a form field - add tooltip to label instead
                    const formGroup = element.closest('.form-group');
                    if (formGroup) {
                        const label = formGroup.querySelector('label[for="' + element.id + '"]');
                        if (label && !label.hasAttribute('data-tooltip')) {
                            addTooltip(label, window.TOOLTIP_DEFINITIONS[key]);
                            return;
                        }
                    }

                    // Otherwise add to element itself
                    addTooltip(element, window.TOOLTIP_DEFINITIONS[key]);
                }
            });
        });
    }

    /**
     * Main initialization function
     */
    function initTooltips() {
        // Check if definitions are loaded
        if (!window.TOOLTIP_DEFINITIONS) {
            console.error('Tooltip definitions not loaded. Make sure tooltip-definitions.js is included before tooltip-init.js');
            return;
        }

        // Process all form labels
        const labels = document.querySelectorAll('.form-group label, label');
        labels.forEach(processLabel);

        // Process table headers
        processTableHeaders();

        // Process row headers (first column td cells)
        processRowHeaders();

        // Process select elements
        processSelects();

        // Process elements by ID
        processElementsByID();

    }

    /**
     * Re-initialize tooltips (useful after dynamic content loads)
     */
    function refreshTooltips() {
        initTooltips();
    }

    /**
     * Manually add tooltip to element by key
     */
    function addTooltipByKey(element, key, options = {}) {
        if (!window.TOOLTIP_DEFINITIONS || !window.TOOLTIP_DEFINITIONS[key]) {
            console.warn(`Tooltip key "${key}" not found in definitions`);
            return false;
        }

        return addTooltip(element, window.TOOLTIP_DEFINITIONS[key], options);
    }

    // Export functions to global scope
    window.initTooltips = initTooltips;
    window.refreshTooltips = refreshTooltips;
    window.addTooltip = addTooltip;
    window.addTooltipByKey = addTooltipByKey;

    // Auto-initialize on DOM content loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTooltips);
    } else {
        // DOM already loaded
        initTooltips();
    }

})();
