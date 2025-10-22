// Street Section Renderer Utility
// Handles all SVG generation for street cross-section views

class StreetSectionRenderer {
    constructor() {
        this.svgWidth = 1400;
        this.svgHeight = 500; // Increased from 400 to accommodate all elements
        this.leftMargin = 50;  // Reduced from 200 (75% reduction)
        this.rightMargin = 50; // Reduced from 200 (75% reduction)
        this.diagramTitle = '';
        this.leftSetback = 0;
        this.rightSetback = 0;
    }

    /**
     * Set optional diagram title
     */
    setDiagramTitle(title) {
        this.diagramTitle = title || '';
    }

    /**
     * Set building setbacks (in metres)
     */
    setSetbacks(leftSetback, rightSetback) {
        this.leftSetback = leftSetback || 0;
        this.rightSetback = rightSetback || 0;
    }

    /**
     * Generate complete street cross-section SVG
     */
    generateCrossSection(zones, totalWidth) {
        // Calculate dimensions
        const buildingWidth = 120; // Width of each building

        // First, establish scale based on available space for road
        const drawingWidth = this.svgWidth - this.leftMargin - this.rightMargin;
        let scale = drawingWidth / totalWidth;

        // Calculate actual road drawing width
        let actualRoadWidth = totalWidth * scale;

        // Calculate setback widths in pixels (setback is the total distance from building to property line)
        const leftSetbackPixels = this.leftSetback * scale;
        const rightSetbackPixels = this.rightSetback * scale;

        // Total width: left building + left setback + road + right setback + right building
        const totalContentWidth = buildingWidth + leftSetbackPixels + actualRoadWidth + rightSetbackPixels + buildingWidth;

        // Calculate final SVG width to fit all content with equal margins on both sides
        const finalSvgWidth = totalContentWidth + this.leftMargin + this.rightMargin;

        // Calculate starting X position for left building (should be at leftMargin)
        const leftBuildingStartX = this.leftMargin;
        const leftPropertyLineX = leftBuildingStartX + buildingWidth + leftSetbackPixels;
        const rightPropertyLineX = leftPropertyLineX + actualRoadWidth;
        const roadStartX = leftPropertyLineX;

        let svg = `<svg width="100%" height="${this.svgHeight}" viewBox="0 0 ${finalSvgWidth} ${this.svgHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;

        // White background (no gradient)
        svg += `<rect width="${finalSvgWidth}" height="${this.svgHeight}" fill="#ffffff"/>`;

        // Calculate vertical positioning with padding
        const topPadding = 40;
        const bottomPadding = 40;
        const groundY = 320; // Adjusted ground level position
        const maxElevation = 12;

        // Optional diagram title
        if (this.diagramTitle) {
            svg += `<text x="${finalSvgWidth / 2}" y="30" text-anchor="middle" fill="#1e293b" font-size="18" font-weight="bold">${this.diagramTitle}</text>`;
        }

        // Property lines (line drawings only) - positioned at road boundaries
        svg += this.drawPropertyLines(leftPropertyLineX, rightPropertyLineX);

        // Buildings will be drawn after we know the max elevation

        // Draw colored ground strips for each zone FIRST (behind everything)
        // Road segments start at left property line
        let currentX = roadStartX;
        const zonePositions = {}; // Track positions for embedding

        zones.forEach((zone, idx) => {
            if (!zone.parentId) {
                const zoneWidth = zone.width * scale;
                svg += this.drawGroundStrip(zone, currentX, zoneWidth, groundY);
                zonePositions[zone.id] = { x: currentX, width: zoneWidth };
                currentX += zoneWidth;
            }
        });

        // Draw each zone outline (non-embedded zones)
        currentX = roadStartX;
        zones.forEach((zone, idx) => {
            if (!zone.parentId) {
                const zoneWidth = zone.width * scale;
                svg += this.drawZone(zone, currentX, zoneWidth, groundY, idx, zones, scale, zonePositions);
                currentX += zoneWidth;
            }
        });

        // Draw grey line along top of segments with vertical connectors
        svg += this.drawSegmentTopLine(zones, scale, groundY, roadStartX);

        // Draw buildings - bottom aligns with top of raised segments
        // Left building starts at leftMargin, right building starts after right setback
        svg += this.drawBuilding(leftBuildingStartX, 180, groundY - maxElevation, buildingWidth);
        const rightBuildingStartX = rightPropertyLineX + rightSetbackPixels;
        svg += this.drawBuilding(rightBuildingStartX, 200, groundY - maxElevation, buildingWidth);

        // Dimension lines
        svg += this.drawDimensions(zones, scale, groundY + 70, leftPropertyLineX, leftSetbackPixels, rightSetbackPixels);

        // Total width dimension - ensure it fits within SVG height
        const totalWidthY = Math.min(groundY + 95, this.svgHeight - bottomPadding - 25);
        svg += this.drawTotalWidth(totalWidth, totalWidthY, leftPropertyLineX, actualRoadWidth);

        svg += '</svg>';
        return svg;
    }

    /**
     * Draw colored ground strip behind zone (colored background area)
     */
    drawGroundStrip(zone, startX, width, groundY) {
        const color = zone.colour || zone.color || '#ffffff';
        // Adjust ground strip Y position and height if above road level
        const aboveRoadLevel = zone.aboveRoadLevel || false;
        const elevationShift = aboveRoadLevel ? -12 : 0; // Quarter of original (12 pixels)
        const stripHeight = aboveRoadLevel ? 72 : 60; // Extended to reach same bottom
        return `<rect x="${startX}" y="${groundY + elevationShift}" width="${width}" height="${stripHeight}" fill="${color}" opacity="0.4" />`;
    }

    /**
     * Draw a single zone with elevation and styling (OUTLINE ONLY)
     */
    drawZone(zone, startX, width, groundY, zoneIndex, allZones, scale, zonePositions) {
        let svg = '';

        // Check if zone is above road level
        const aboveRoadLevel = zone.aboveRoadLevel || false;
        const elevationShift = aboveRoadLevel ? -12 : 0; // Quarter of original elevation (12 pixels)

        // NO BOXES ABOVE GROUND LEVEL - removed the rect element

        // Check if this zone has a footpath child (for verge/nature strip/tree strip zones)
        const isVergeType = zone.type === 'verge' || zone.type === 'nature-strip' || zone.type === 'tree-strip';
        const hasFootpathChild = isVergeType && allZones &&
            allZones.some(z => z.parentId === zone.id && (z.type === 'footpath' || z.type === 'sidewalk'));

        // Add objects (cars, pedestrians, trees, etc.) - as line drawings
        // Skip if this is a verge-type zone with a footpath child (trees will be placed in roadside spaces)
        if (!hasFootpathChild) {
            svg += this.addZoneObjects(zone, startX, width, groundY + elevationShift);
        }

        // Zone label in the colored area
        const labelY = groundY + 25; // At road level
        svg += `<text x="${startX + width / 2}" y="${labelY}" text-anchor="middle" fill="#1e293b" font-size="12" font-weight="600">${zone.label}</text>`;

        // Draw embedded child zones
        if (allZones && scale && zonePositions) {
            const childZones = allZones.filter(z => z.parentId === zone.id);
            if (childZones.length > 0) {
                childZones.forEach(child => {
                    const childWidth = child.width * scale;
                    let childX;

                    // Check if this is a footpath child of verge/nature strip/tree strip
                    const isFootpath = child.type === 'footpath' || child.type === 'sidewalk';
                    const isParentVergeType = zone.type === 'verge' || zone.type === 'nature-strip' || zone.type === 'tree-strip';

                    if (isFootpath && isParentVergeType) {
                        // Always center the footpath in the parent
                        childX = startX + (width - childWidth) / 2;

                        // Draw child ground strip
                        svg += this.drawGroundStrip(child, childX, childWidth, groundY);

                        // Draw child zone (footpath)
                        const childAboveRoad = child.aboveRoadLevel || false;
                        const childElevationShift = childAboveRoad ? -12 : 0;
                        svg += this.addZoneObjects(child, childX, childWidth, groundY + childElevationShift);

                        // Child label (slightly lower to avoid overlap)
                        const childLabelY = groundY + 40;
                        svg += `<text x="${childX + childWidth / 2}" y="${childLabelY}" text-anchor="middle" fill="#1e293b" font-size="10" font-weight="600">${child.label}</text>`;
                        svg += `<text x="${childX + childWidth / 2}" y="${childLabelY + 12}" text-anchor="middle" fill="#475569" font-size="9">${child.width.toFixed(1)}m</text>`;

                        // Position icon based on CHILD's iconPosition setting (not parent's)
                        // Icons are positioned relative to the CHILD zone boundaries
                        // Can be numeric (10-90) or string ('left', 'center', 'right')
                        const childPosition = child.iconPosition || 'center';
                        let iconX;

                        if (typeof childPosition === 'number') {
                            // Numeric position: use as percentage (clamped to 10-90 range)
                            const percentage = Math.max(10, Math.min(90, childPosition)) / 100;
                            iconX = childX + childWidth * percentage;
                        } else if (childPosition === 'left') {
                            // 40% from left (backwards compatibility)
                            iconX = childX + childWidth * 0.4;
                        } else if (childPosition === 'right') {
                            // 60% from left (backwards compatibility)
                            iconX = childX + childWidth * 0.6;
                        } else {
                            // Center of child (50%)
                            iconX = childX + childWidth / 2;
                        }

                        // Draw the child's icon at the calculated position (if child has an icon and it's not 'none')
                        if (child.icon && child.icon !== 'none' && child.iconCategory) {
                            svg += this.embedSVGIcon(child.iconCategory, child.icon, iconX, groundY + childElevationShift);
                        }

                        // Draw the parent's icon (tree) in the roadside spaces (if parent has an icon and it's not 'none')
                        if (zone.icon && zone.icon !== 'none' && zone.iconCategory) {
                            // Position parent icon in the space outside the child footpath
                            const parentIconPosition = zone.iconPosition || 'center';
                            let parentIconX;

                            if (typeof parentIconPosition === 'number') {
                                const percentage = Math.max(10, Math.min(90, parentIconPosition)) / 100;
                                parentIconX = startX + width * percentage;
                            } else if (parentIconPosition === 'left') {
                                parentIconX = startX + width * 0.4;
                            } else if (parentIconPosition === 'right') {
                                parentIconX = startX + width * 0.6;
                            } else {
                                parentIconX = startX + width / 2;
                            }

                            svg += this.embedSVGIcon(zone.iconCategory, zone.icon, parentIconX, groundY + elevationShift);
                        }
                    } else {
                        // Default: Center the child zone within the parent
                        childX = startX + (width - childWidth) / 2;

                        // Draw child ground strip
                        svg += this.drawGroundStrip(child, childX, childWidth, groundY);

                        // Draw child zone
                        const childAboveRoad = child.aboveRoadLevel || false;
                        const childElevationShift = childAboveRoad ? -12 : 0;
                        svg += this.addZoneObjects(child, childX, childWidth, groundY + childElevationShift);

                        // Child label (slightly lower to avoid overlap)
                        const childLabelY = groundY + 40;
                        svg += `<text x="${childX + childWidth / 2}" y="${childLabelY}" text-anchor="middle" fill="#1e293b" font-size="10" font-weight="600">${child.label}</text>`;
                        svg += `<text x="${childX + childWidth / 2}" y="${childLabelY + 12}" text-anchor="middle" fill="#475569" font-size="9">${child.width.toFixed(1)}m</text>`;
                    }
                });
            }
        }

        return svg;
    }

    /**
     * Get elevation offset based on zone type (kerb height - Australian spelling)
     */
    getElevationOffset(type) {
        const elevations = {
            'footpath': -8,
            'sidewalk': -8,
            'median': -6,
            'verge': -4,
            'tree-strip': -4,
            'bus-stop': -8,
            'station': -12,
            'road': 0,
            'driving-lane': 0,
            'bus-lane': 0,
            'transit-lane': 0,
            'bike-lane': 0,
            'cycle-track': -3,
            'parking': 0
        };
        return elevations[type] || 0;
    }


    /**
     * Add objects to zones (using SVG images from the icon library)
     */
    addZoneObjects(zone, startX, width, groundY) {
        let svg = '';

        // If zone has an icon, use it (skip if icon is null or 'none')
        if (zone.icon && zone.icon !== 'none' && zone.iconCategory) {
            const position = zone.iconPosition || 'center';
            let xPos;

            // Calculate position based on iconPosition setting
            // Can be numeric (10, 20, 30, 40, 50, 60, 70, 80, 90) or string ('left', 'center', 'right')
            if (typeof position === 'number') {
                // Numeric position: use as percentage (clamped to 10-90 range)
                const percentage = Math.max(10, Math.min(90, position)) / 100;
                xPos = startX + width * percentage;
            } else if (position === 'left') {
                xPos = startX + width * 0.4; // 40% from left (backwards compatibility)
            } else if (position === 'right') {
                xPos = startX + width * 0.6; // 60% from left (backwards compatibility)
            } else {
                xPos = startX + width / 2; // Center (50%)
            }

            svg += this.embedSVGIcon(zone.iconCategory, zone.icon, xPos, groundY);
        }

        return svg;
    }

    /**
     * Embed an SVG icon from the library
     */
    embedSVGIcon(category, iconId, x, y) {
        // Extract the base name and variant number from iconId
        // iconId format: "car_sedan_v1" -> "car_sedan_v1.png"
        const iconPath = `/assets/streetscape_icons/${category}/${iconId}.png`;

        // For now, we'll use an image tag within the SVG
        // The icon will be scaled appropriately based on its category
        // All scales doubled (2x size)
        let scale = 0.30; // Default scale (doubled from 0.15)
        let yOffset = 0; // Adjusted so figures touch ground line
        let baseWidth = 200; // Default viewBox width
        let baseHeight = 300; // Default viewBox height

        // Adjust scale and offset based on category and specific icons
        // Note: vehicles have different dimensions (240x140 vs 200x300)
        if (category === 'vehicles') {
            baseWidth = 240;
            baseHeight = 140;
            // Bus is 4x original size (2x the already doubled size)
            if (iconId === 'bus') {
                scale = 0.88; // 4x original (0.22 * 4)
            } else {
                scale = 0.44; // Doubled from 0.22
            }
            yOffset = 0;
        } else if (category === 'people') {
            scale = 0.26; // Doubled from 0.13
            yOffset = 0;
        } else if (category === 'cyclists') {
            scale = 0.28; // Doubled from 0.14
            yOffset = 0;
        } else if (category === 'trees') {
            // tree-big is 4x original size (2x the already doubled size)
            if (iconId === 'tree-big') {
                scale = 0.64; // 4x original (0.16 * 4)
            } else {
                scale = 0.32; // Doubled from 0.16
            }
            yOffset = 0;
        } else if (category === 'street_furniture') {
            scale = 0.30; // Doubled from 0.15
            yOffset = 0;
        }

        const iconWidth = baseWidth * scale;
        const iconHeight = baseHeight * scale;

        return `<image href="${iconPath}" x="${x - iconWidth/2}" y="${y - iconHeight}" width="${iconWidth}" height="${iconHeight}" preserveAspectRatio="xMidYMid meet"/>`;
    }

    /**
     * Draw building (OUTLINE ONLY) - no windows
     * Building bottom aligns with the top of raised segments
     * x is the absolute start position, width is the building width
     */
    drawBuilding(x, height, bottomY, width) {
        return `<rect x="${x}" y="${bottomY - height}" width="${width}" height="${height}" fill="none" stroke="#000000" stroke-width="2" />`;
    }

    /**
     * Draw tree (OUTLINE ONLY) - starts at ground level
     */
    drawTree(x, groundY) {
        return `<g transform="translate(${x},${groundY})">
            <rect x="-6" y="-40" width="12" height="40" fill="none" stroke="#000000" stroke-width="1.5" />
            <ellipse cx="0" cy="-75" rx="35" ry="45" fill="none" stroke="#000000" stroke-width="1.5" />
            <ellipse cx="-15" cy="-70" rx="25" ry="35" fill="none" stroke="#000000" stroke-width="1" />
            <ellipse cx="15" cy="-70" rx="25" ry="35" fill="none" stroke="#000000" stroke-width="1" />
            <ellipse cx="0" cy="-85" rx="28" ry="38" fill="none" stroke="#000000" stroke-width="1" />
        </g>`;
    }

    /**
     * Draw pedestrian (front view - LINE DRAWING)
     */
    drawPedestrian(x, groundY, color) {
        return `<g transform="translate(${x},${groundY})">
            <circle cx="0" cy="-35" r="6" fill="none" stroke="#000000" stroke-width="2" />
            <line x1="0" y1="-29" x2="0" y2="-10" stroke="#000000" stroke-width="2" stroke-linecap="round" />
            <line x1="0" y1="-22" x2="-8" y2="-14" stroke="#000000" stroke-width="2" stroke-linecap="round" />
            <line x1="0" y1="-22" x2="8" y2="-14" stroke="#000000" stroke-width="2" stroke-linecap="round" />
            <line x1="0" y1="-10" x2="-6" y2="0" stroke="#000000" stroke-width="2" stroke-linecap="round" />
            <line x1="0" y1="-10" x2="6" y2="0" stroke="#000000" stroke-width="2" stroke-linecap="round" />
        </g>`;
    }

    /**
     * Draw bicycle (FRONT VIEW - LINE DRAWING, NO RIDER)
     */
    drawBicycle(x, groundY) {
        return `<g transform="translate(${x},${groundY})">
            <!-- Wheels (front view - circles) -->
            <circle cx="-12" cy="-10" r="6" fill="none" stroke="#000000" stroke-width="2" />
            <circle cx="12" cy="-10" r="6" fill="none" stroke="#000000" stroke-width="2" />
            <!-- Frame (simplified front view) -->
            <line x1="-12" y1="-10" x2="0" y2="-22" stroke="#000000" stroke-width="2" />
            <line x1="12" y1="-10" x2="0" y2="-22" stroke="#000000" stroke-width="2" />
            <line x1="0" y1="-22" x2="0" y2="-30" stroke="#000000" stroke-width="2" />
            <!-- Handlebars -->
            <line x1="-10" y1="-30" x2="10" y2="-30" stroke="#000000" stroke-width="2" />
            <!-- Seat -->
            <line x1="-4" y1="-22" x2="4" y2="-22" stroke="#000000" stroke-width="2" />
        </g>`;
    }

    /**
     * Draw car (front view - EMOJI-LIKE, OUTLINE ONLY, NO WHEELS, RAISED)
     */
    drawCar(x, groundY, color) {
        return `<g transform="translate(${x},${groundY - 5})">
            <!-- Main body - rounded rectangle (raised 5px) -->
            <rect x="-25" y="-34" width="50" height="28" rx="8" ry="8" fill="none" stroke="#000000" stroke-width="2" />
            <!-- Windshield - rounded trapezoid shape -->
            <path d="M -18,-34 L -10,-46 L 10,-46 L 18,-34" fill="none" stroke="#000000" stroke-width="2" />
            <!-- Headlights - circles -->
            <circle cx="-18" cy="-10" r="4" fill="none" stroke="#000000" stroke-width="1.5" />
            <circle cx="18" cy="-10" r="4" fill="none" stroke="#000000" stroke-width="1.5" />
            <!-- Grille -->
            <rect x="-8" y="-8" width="16" height="3" rx="1" fill="none" stroke="#000000" stroke-width="1" />
        </g>`;
    }

    /**
     * Draw bus (front view - EMOJI-LIKE, OUTLINE ONLY, NO WHEELS, RAISED)
     */
    drawBus(x, groundY) {
        return `<g transform="translate(${x},${groundY - 5})">
            <!-- Main body - tall rounded rectangle (raised 5px) -->
            <rect x="-35" y="-54" width="70" height="48" rx="6" ry="6" fill="none" stroke="#000000" stroke-width="2" />
            <!-- Windshield at top -->
            <rect x="-28" y="-50" width="56" height="12" rx="3" fill="none" stroke="#000000" stroke-width="1.5" />
            <!-- Windows - large rounded rectangles -->
            <rect x="-30" y="-34" width="18" height="18" rx="2" fill="none" stroke="#000000" stroke-width="1" />
            <rect x="-8" y="-34" width="18" height="18" rx="2" fill="none" stroke="#000000" stroke-width="1" />
            <rect x="12" y="-34" width="18" height="18" rx="2" fill="none" stroke="#000000" stroke-width="1" />
            <!-- Headlights -->
            <circle cx="-26" cy="-12" r="3" fill="none" stroke="#000000" stroke-width="1.5" />
            <circle cx="26" cy="-12" r="3" fill="none" stroke="#000000" stroke-width="1.5" />
        </g>`;
    }

    /**
     * Draw bus stop shelter (OUTLINE ONLY)
     */
    drawBusStop(x, groundY) {
        return `<g transform="translate(${x},${groundY})">
            <rect x="-35" y="-70" width="70" height="70" fill="none" stroke="#000000" stroke-width="2" />
            <rect x="-30" y="-65" width="60" height="15" fill="none" stroke="#000000" stroke-width="1.5" />
            <text x="0" y="-53" text-anchor="middle" font-size="9" fill="#000000" font-weight="bold">BUS STOP</text>
            <rect x="-25" y="-20" width="50" height="5" fill="none" stroke="#000000" stroke-width="1.5" />
            <rect x="-20" y="-30" width="40" height="12" fill="none" stroke="#000000" stroke-width="1.5" />
        </g>`;
    }

    /**
     * Draw street light (OUTLINE ONLY)
     */
    drawStreetLight(x) {
        return `<g transform="translate(${x},300)">
            <line x1="0" y1="0" x2="0" y2="-80" stroke="#000000" stroke-width="2" />
            <ellipse cx="0" cy="-85" rx="8" ry="5" fill="none" stroke="#000000" stroke-width="1.5" />
            <path d="M -10,-85 Q -12,-95 0,-100 Q 12,-95 10,-85 Z" fill="none" stroke="#000000" stroke-width="1.5" />
            <ellipse cx="0" cy="-98" rx="6" ry="6" fill="none" stroke="#000000" stroke-width="1.5" />
        </g>`;
    }

    /**
     * Draw property lines
     */
    drawPropertyLines(leftX, rightX) {
        return `<line x1="${leftX}" y1="80" x2="${leftX}" y2="340" stroke="#ef4444" stroke-width="3" stroke-dasharray="8,4" />
                <text x="${leftX}" y="70" text-anchor="middle" fill="#ef4444" font-size="13" font-weight="bold">PROPERTY LINE</text>
                <line x1="${rightX}" y1="80" x2="${rightX}" y2="340" stroke="#ef4444" stroke-width="3" stroke-dasharray="8,4" />
                <text x="${rightX}" y="70" text-anchor="middle" fill="#ef4444" font-size="13" font-weight="bold">PROPERTY LINE</text>`;
    }

    /**
     * Draw grey line along top of segments with vertical connectors for height changes
     */
    drawSegmentTopLine(zones, scale, groundY, startX) {
        let svg = '';
        let currentX = startX;
        let previousY = null;

        // Only draw for parent zones (child zones don't add to width)
        zones.forEach((zone, idx) => {
            if (!zone.parentId) {
                const zoneWidth = zone.width * scale;
                const aboveRoadLevel = zone.aboveRoadLevel || false;
                const elevationShift = aboveRoadLevel ? -12 : 0;
                const topY = groundY + elevationShift;

                // Vertical connector if height changed from previous segment
                if (previousY !== null && previousY !== topY) {
                    svg += `<line x1="${currentX}" y1="${previousY}" x2="${currentX}" y2="${topY}" stroke="#666666" stroke-width="2" />`;
                }

                // Horizontal line along top of this segment
                const nextX = currentX + zoneWidth;
                svg += `<line x1="${currentX}" y1="${topY}" x2="${nextX}" y2="${topY}" stroke="#666666" stroke-width="2" />`;

                currentX = nextX;
                previousY = topY;
            }
        });

        return svg;
    }

    /**
     * Draw dimension lines for each zone with labels and widths, including setbacks
     */
    drawDimensions(zones, scale, baseY, leftPropertyX, leftSetbackPixels, rightSetbackPixels) {
        let svg = '';

        // Draw left setback dimension if > 0
        if (this.leftSetback > 0) {
            const startX = leftPropertyX - leftSetbackPixels;

            svg += `<line x1="${startX}" y1="${baseY}" x2="${leftPropertyX}" y2="${baseY}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,2" />`;
            svg += `<line x1="${startX}" y1="${baseY - 5}" x2="${startX}" y2="${baseY + 5}" stroke="#ef4444" stroke-width="2" />`;
            svg += `<line x1="${leftPropertyX}" y1="${baseY - 5}" x2="${leftPropertyX}" y2="${baseY + 5}" stroke="#ef4444" stroke-width="2" />`;
            svg += `<text x="${startX + leftSetbackPixels / 2}" y="${baseY - 10}" text-anchor="middle" fill="#ef4444" font-size="10" font-weight="600">Setback</text>`;
            svg += `<text x="${startX + leftSetbackPixels / 2}" y="${baseY + 15}" text-anchor="middle" fill="#ef4444" font-size="9">${this.leftSetback.toFixed(1)}m</text>`;
        }

        // Only show dimensions for zones without a parent (child zones show inline)
        let currentX = leftPropertyX;
        zones.forEach(zone => {
            if (!zone.parentId) {
                const zoneWidth = zone.width * scale;
                const nextX = currentX + zoneWidth;

                // Dimension line and ticks
                svg += `<line x1="${currentX}" y1="${baseY}" x2="${nextX}" y2="${baseY}" stroke="#1e293b" stroke-width="2" />`;
                svg += `<line x1="${currentX}" y1="${baseY - 5}" x2="${currentX}" y2="${baseY + 5}" stroke="#1e293b" stroke-width="2" />`;
                svg += `<line x1="${nextX}" y1="${baseY - 5}" x2="${nextX}" y2="${baseY + 5}" stroke="#1e293b" stroke-width="2" />`;

                // Width measurement on dimension line (label removed - now in colored area)
                svg += `<text x="${currentX + zoneWidth / 2}" y="${baseY + 15}" text-anchor="middle" fill="#475569" font-size="10">${zone.width.toFixed(1)}m</text>`;

                currentX = nextX;
            }
        });

        // Draw right setback dimension if > 0
        if (this.rightSetback > 0) {
            const endX = currentX + rightSetbackPixels;

            svg += `<line x1="${currentX}" y1="${baseY}" x2="${endX}" y2="${baseY}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,2" />`;
            svg += `<line x1="${currentX}" y1="${baseY - 5}" x2="${currentX}" y2="${baseY + 5}" stroke="#ef4444" stroke-width="2" />`;
            svg += `<line x1="${endX}" y1="${baseY - 5}" x2="${endX}" y2="${baseY + 5}" stroke="#ef4444" stroke-width="2" />`;
            svg += `<text x="${currentX + rightSetbackPixels / 2}" y="${baseY - 10}" text-anchor="middle" fill="#ef4444" font-size="10" font-weight="600">Setback</text>`;
            svg += `<text x="${currentX + rightSetbackPixels / 2}" y="${baseY + 15}" text-anchor="middle" fill="#ef4444" font-size="9">${this.rightSetback.toFixed(1)}m</text>`;
        }

        return svg;
    }

    /**
     * Draw total width dimension
     */
    drawTotalWidth(totalWidth, baseY, leftPropertyX, actualRoadWidth) {
        const startX = leftPropertyX;
        const endX = leftPropertyX + actualRoadWidth;

        return `<line x1="${startX}" y1="${baseY}" x2="${endX}" y2="${baseY}" stroke="#0369a1" stroke-width="3" />
                <line x1="${startX}" y1="${baseY - 7}" x2="${startX}" y2="${baseY + 7}" stroke="#0369a1" stroke-width="3" />
                <line x1="${endX}" y1="${baseY - 7}" x2="${endX}" y2="${baseY + 7}" stroke="#0369a1" stroke-width="3" />
                <text x="${(startX + endX) / 2}" y="${baseY + 20}" text-anchor="middle" fill="#0369a1" font-size="14" font-weight="bold">${totalWidth.toFixed(1)}m Width of Road Reserve</text>`;
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StreetSectionRenderer;
}
