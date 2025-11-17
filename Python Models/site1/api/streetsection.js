export default async function handler(req, res) {
    // Authentication is handled by the Lambda wrapper (simulation-wrapper.js)

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, parameters } = req.body;

    try {
        if (action === 'exportFile') {
            const startTime = Date.now();
            const content = generateExport(parameters);
            const executionTimeMs = Date.now() - startTime;

            console.log(`Street Section ${parameters.format} export completed in ${executionTimeMs}ms`);
            res.json({ success: true, content, executionTimeMs });
        } else {
            res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Export failed: ' + error.message });
    }
}

function generateExport(params) {
    const { zones, format } = params;

    switch (format) {
        case 'svg':
            return generateSVGExport(zones);
        case 'cad':
            return generateCADScript(zones);
        case 'dwf':
            return generateDWFScript(zones);
        default:
            throw new Error('Unsupported export format');
    }
}

function generateSVGExport(zones) {
    const svgWidth = 1400;
    const svgHeight = 400;
    const leftMargin = 200;
    const rightMargin = 200;
    const drawingWidth = svgWidth - leftMargin - rightMargin;
    const totalWidth = zones.reduce((sum, z) => sum + z.width, 0);
    const scale = drawingWidth / totalWidth;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="skyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#87ceeb;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#e0f2fe;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect width="${svgWidth}" height="${svgHeight}" fill="url(#skyGradient)"/>`;

    // Property lines
    svg += `<line x1="${leftMargin}" y1="80" x2="${leftMargin}" y2="340" stroke="#ef4444" stroke-width="3" stroke-dasharray="8,4" />
    <text x="${leftMargin}" y="70" text-anchor="middle" fill="#ef4444" font-size="13" font-weight="bold">PROPERTY LINE</text>
    <line x1="${svgWidth - rightMargin}" y1="80" x2="${svgWidth - rightMargin}" y2="340" stroke="#ef4444" stroke-width="3" stroke-dasharray="8,4" />
    <text x="${svgWidth - rightMargin}" y="70" text-anchor="middle" fill="#ef4444" font-size="13" font-weight="bold">PROPERTY LINE</text>`;

    // Buildings
    svg += generateBuilding(120, 180);
    svg += generateBuilding(svgWidth - 120, 200);

    // Ground
    const groundY = 300;
    svg += `<rect x="${leftMargin}" y="${groundY}" width="${drawingWidth}" height="60" fill="#c2a38a" />`;

    // Zones
    let currentX = leftMargin;
    zones.forEach((zone, idx) => {
        const zoneWidth = zone.width * scale;
        svg += generateZone(zone, currentX, zoneWidth, groundY);
        currentX += zoneWidth;
    });

    // Dimension lines
    currentX = leftMargin;
    const dimY = groundY + 75;
    zones.forEach(zone => {
        const zoneWidth = zone.width * scale;
        const nextX = currentX + zoneWidth;
        svg += `<line x1="${currentX}" y1="${dimY}" x2="${nextX}" y2="${dimY}" stroke="#1e293b" stroke-width="2" />
        <line x1="${currentX}" y1="${dimY - 5}" x2="${currentX}" y2="${dimY + 5}" stroke="#1e293b" stroke-width="2" />
        <line x1="${nextX}" y1="${dimY - 5}" x2="${nextX}" y2="${dimY + 5}" stroke="#1e293b" stroke-width="2" />`;
        currentX = nextX;
    });

    // Total width
    const totalDimY = groundY + 100;
    svg += `<line x1="${leftMargin}" y1="${totalDimY}" x2="${svgWidth - rightMargin}" y2="${totalDimY}" stroke="#0369a1" stroke-width="3" />
    <line x1="${leftMargin}" y1="${totalDimY - 7}" x2="${leftMargin}" y2="${totalDimY + 7}" stroke="#0369a1" stroke-width="3" />
    <line x1="${svgWidth - rightMargin}" y1="${totalDimY - 7}" x2="${svgWidth - rightMargin}" y2="${totalDimY + 7}" stroke="#0369a1" stroke-width="3" />
    <text x="${svgWidth / 2}" y="${totalDimY - 7}" text-anchor="middle" fill="#0369a1" font-size="14" font-weight="bold">${totalWidth.toFixed(1)}m Width of Right-of-Way</text>`;

    svg += '</svg>';
    return svg;
}

function generateBuilding(x, height) {
    let svg = `<g transform="translate(${x},0)">`;
    svg += `<rect x="-60" y="${300 - height}" width="120" height="${height}" fill="#d4b896" stroke="#a0826d" stroke-width="2" />`;
    const floors = Math.floor(height / 40);
    for (let floor = 0; floor < floors; floor++) {
        [-40, -10, 20].forEach(xPos => {
            svg += `<rect x="${xPos}" y="${300 - height + 20 + floor * 40}" width="15" height="25" fill="#87ceeb" stroke="#5a7a8a" stroke-width="1" />`;
        });
    }
    svg += `<rect x="-8" y="270" width="16" height="30" fill="#6b4423" stroke="#4a2f1a" stroke-width="1" /></g>`;
    return svg;
}

function generateZone(zone, startX, width, groundY) {
    const elevationOffset = getElevationOffset(zone.type);
    const zoneTop = groundY - 80 + elevationOffset;
    const zoneHeight = 80 - elevationOffset;

    let svg = `<rect x="${startX}" y="${zoneTop}" width="${width}" height="${zoneHeight}" fill="${zone.colour}" stroke="#334155" stroke-width="1.5" />`;

    // Labels
    const labelY = groundY + 25;
    svg += `<text x="${startX + width / 2}" y="${labelY}" text-anchor="middle" fill="#1e293b" font-size="12" font-weight="600">${zone.label}</text>`;
    svg += `<text x="${startX + width / 2}" y="${labelY + 15}" text-anchor="middle" fill="#475569" font-size="11">${zone.width.toFixed(1)}m</text>`;

    return svg;
}

function getElevationOffset(type) {
    const elevations = {
        'footpath': -8, 'sidewalk': -8, 'median': -6, 'verge': -4,
        'tree-strip': -4, 'bus-stop': -8, 'station': -12, 'road': 0,
        'driving-lane': 0, 'bus-lane': 0, 'transit-lane': 0,
        'bike-lane': 0, 'cycle-track': -3, 'parking': 0
    };
    return elevations[type] || 0;
}

function generateCADScript(zones) {
    const totalWidth = zones.reduce((sum, z) => sum + z.width, 0);
    let script = '; AutoCAD Script File - Street Cross-Section\n';
    script += '; Generated by Traffic Labb Street Section Designer\n';
    script += `; Generated: ${new Date().toISOString()}\n`;
    script += '; All measurements in metres\n\n';

    script += 'UNITS 2 4 1 2 0 N\n';
    script += 'ZOOM E\n\n';

    // Create layers
    script += 'LAYER N STREET-ZONES C 7 STREET-ZONES\n';
    script += 'LAYER N STREET-DIMENSIONS C 3 STREET-DIMENSIONS\n';
    script += 'LAYER N STREET-TEXT C 1 STREET-TEXT\n';
    script += 'LAYER N STREET-REFERENCE C 2 STREET-REFERENCE\n\n';

    // Draw zones
    script += 'LAYER S STREET-ZONES\n';
    let currentX = 0;
    zones.forEach((zone, idx) => {
        const nextX = currentX + zone.width;
        const elevOffset = getElevationOffset(zone.type) * 0.1; // Scale elevation

        // Zone boundary
        script += `PLINE\n${currentX.toFixed(3)},${elevOffset.toFixed(3)}\n`;
        script += `${nextX.toFixed(3)},${elevOffset.toFixed(3)}\n`;
        script += `${nextX.toFixed(3)},${(1.0 + elevOffset).toFixed(3)}\n`;
        script += `${currentX.toFixed(3)},${(1.0 + elevOffset).toFixed(3)}\nC\n\n`;

        // Zone label
        script += 'LAYER S STREET-TEXT\n';
        script += `TEXT ${((currentX + nextX) / 2).toFixed(3)},${(0.5 + elevOffset).toFixed(3)} 0.15 0 ${zone.label}\n`;
        script += `TEXT ${((currentX + nextX) / 2).toFixed(3)},${(0.3 + elevOffset).toFixed(3)} 0.12 0 ${zone.width.toFixed(1)}m\n`;

        currentX = nextX;
    });

    // Dimension lines
    script += '\nLAYER S STREET-DIMENSIONS\n';
    currentX = 0;
    zones.forEach(zone => {
        const nextX = currentX + zone.width;
        script += `LINE ${currentX.toFixed(3)},-0.5 ${nextX.toFixed(3)},-0.5\n`;
        script += `LINE ${currentX.toFixed(3)},-0.55 ${currentX.toFixed(3)},-0.45\n`;
        script += `LINE ${nextX.toFixed(3)},-0.55 ${nextX.toFixed(3)},-0.45\n`;
        currentX = nextX;
    });

    // Total width
    script += `\nLINE 0,-0.8 ${totalWidth.toFixed(3)},-0.8\n`;
    script += `LINE 0,-0.85 0,-0.75\n`;
    script += `LINE ${totalWidth.toFixed(3)},-0.85 ${totalWidth.toFixed(3)},-0.75\n`;
    script += `TEXT ${(totalWidth / 2).toFixed(3)},-0.95 0.15 0 ${totalWidth.toFixed(1)}m ROW\n`;

    script += '\nZOOM E\n';
    script += 'LAYER S STREET-ZONES\n';

    return script;
}

function generateDWFScript(zones) {
    let script = generateCADScript(zones);

    // Add DWF export commands
    script += '\n; Export to DWF format\n';
    script += 'PLOT\n';
    script += 'Y\n';
    script += 'DWF6 ePlot.pc3\n';
    script += 'ANSI A (8.50 x 11.00 Inches)\n';
    script += 'I\n';
    script += 'L\n';
    script += 'N\n';
    script += 'E\n';
    script += 'F\n';
    script += 'C\n';
    script += 'Y\n';
    script += 'Y\n';
    script += 'N\n';
    script += 'street_section.dwf\n';
    script += 'Y\n';
    script += 'Y\n';

    return script;
}
