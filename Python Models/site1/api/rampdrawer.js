// rampdrawer.js - Backend API for ramp drawing functionality
// Place this file in /api/rampdrawer.js
// Optimized for reliable SVG, AutoCAD, and DWF exports

export default async function handler(req, res) {
    // Set headers for CORS and caching
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Authentication check
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        if (!isValidToken(token)) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const { action, parameters } = req.body;
        console.log('Processing action:', action);

        switch (action) {
            case 'generateDrawings':
                const drawings = generateDrawings(parameters);
                return res.json({ success: true, drawings });
            
            case 'exportAutoCAD':
                const script = generateAutoCADScript(parameters);
                return res.json({ success: true, content: script });
            
            case 'testPuppeteer':
                // Simple test to check if Puppeteer works
                try {
                    const puppeteerCore = await import('puppeteer-core');
                    const chromiumModule = await import('@sparticuz/chromium');
                    return res.json({ 
                        success: true, 
                        message: 'Puppeteer modules loaded successfully',
                        puppeteerVersion: 'loaded',
                        chromiumVersion: 'loaded'
                    });
                } catch (error) {
                    return res.json({ 
                        success: false, 
                        error: `Puppeteer test failed: ${error.message}`,
                        stack: error.stack
                    });
                }
            
            case 'exportFile':
                console.log('Exporting file:', parameters.format);
                const fileContent = await generateFileExport(parameters);
                return res.json({ success: true, content: fileContent });
            
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Handler error:', error);
        
        // Always return JSON, never HTML
        return res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

function isValidToken(token) {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [timestamp, username] = decoded.split(':');
        const tokenAge = Date.now() - parseInt(timestamp);
        return tokenAge < 24 * 60 * 60 * 1000; // 24 hours
    } catch {
        return false;
    }
}

function generateDrawings(params) {
    const { segmentData, width, startingRL, startLabel, endLabel, gradeType } = params;
    
    const sectionSvg = generateSectionView(segmentData, width, startingRL, startLabel, endLabel, gradeType);
    const planSvg = generatePlanView(segmentData, width, gradeType);
    
    return {
        sectionSvg,
        planSvg
    };
}

async function generateFileExport(params) {
    const { type, format, segmentData, width, startingRL, startLabel, endLabel, gradeType } = params;
    
    switch (format) {
        case 'svg':
            return generateSVGExport(params);
        case 'png':
            return await generatePNGExport(params);
        case 'dwf':
            return generateDWFScript(params);
        case 'pdf':
            return await generatePDFExport(params);
        default:
            throw new Error('Unsupported export format');
    }
}

function generateSVGExport(params) {
    const { type, segmentData, width, startingRL, startLabel, endLabel, gradeType } = params;
    
    // Get the raw SVG content
    let svgContent;
    if (type === 'section') {
        svgContent = generateSectionView(segmentData, width, startingRL, startLabel, endLabel, gradeType);
    } else {
        svgContent = generatePlanView(segmentData, width, gradeType);
    }
    
    // Add XML declaration and make it a complete SVG file
    const completeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
${svgContent}`;
    
    return completeSvg;
}

async function generatePNGExport(params) {
    const { type, segmentData, width, startingRL, startLabel, endLabel, gradeType } = params;
    
    // Get the SVG content
    let svgContent;
    if (type === 'section') {
        svgContent = generateSectionView(segmentData, width, startingRL, startLabel, endLabel, gradeType);
    } else {
        svgContent = generatePlanView(segmentData, width, gradeType);
    }
    
    let browser = null;
    
    try {
        // Launch browser with hosted chromium binary
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--hide-scrollbars',
                '--disable-web-security'
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(
                'https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
            ),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        const page = await browser.newPage();
        
        // Set high DPI viewport for better quality
        await page.setViewport({
            width: 1000,
            height: 400,
            deviceScaleFactor: 2 // 2x resolution for crisp output
        });
        
        // Create HTML with embedded SVG and optimized styling
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    html, body {
                        width: 1000px;
                        height: 400px;
                        background: white;
                        font-family: Arial, sans-serif;
                        overflow: hidden;
                    }
                    .container {
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 10px;
                    }
                    svg {
                        max-width: 100%;
                        max-height: 100%;
                        background: white;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    ${svgContent}
                </div>
            </body>
            </html>
        `;
        
        // Set content and wait for it to load
        await page.setContent(html, { 
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        // Wait a bit more to ensure fonts are loaded
        await page.waitForTimeout(1000);
        
        // Take screenshot with high quality settings
        const screenshot = await page.screenshot({
            type: 'png',
            fullPage: false, // Use viewport size
            omitBackground: false,
            captureBeyondViewport: false,
            clip: {
                x: 0,
                y: 0,
                width: 1000,
                height: 400
            }
        });
        
        return screenshot.toString('base64');
        
    } catch (error) {
        console.error('PNG generation error:', error);
        
        // Provide more specific error messages
        if (error.message.includes('timeout')) {
            throw new Error('PNG generation timed out. Please try again or use SVG export.');
        } else if (error.message.includes('memory')) {
            throw new Error('Insufficient memory for PNG generation. Please use SVG export.');
        } else if (error.message.includes('libnspr4') || error.message.includes('shared libraries')) {
            throw new Error('Browser dependencies missing. Please try again or use SVG export.');
        } else {
            throw new Error(`PNG generation failed: ${error.message}`);
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.error('Error closing browser:', closeError);
            }
        }
    }
}

function generateSectionView(segmentData, width, startingRL, startLabel, endLabel, gradeType) {
    const svgWidth = 1000;
    const svgHeight = 400;
    const margin = 80; // Increased margin to accommodate datum text
    
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    const horizontalScale = (svgWidth - 2 * margin) / totalLength;
    
    // Calculate all RLs (elevation points) starting from the specified starting RL
    let currentElevation = startingRL;
    const points = [{x: 0, rl: startingRL}];
    let cumulativeLength = 0;
    
    segmentData.forEach(segment => {
        cumulativeLength += segment.length;
        currentElevation += segment.rise;
        points.push({x: cumulativeLength, rl: currentElevation});
    });
    
    // Find elevation range for proper scaling
    const minRL = Math.min(...points.map(p => p.rl));
    const maxRL = Math.max(...points.map(p => p.rl));
    const rlRange = Math.max(maxRL - minRL, 1); // Ensure minimum range of 1
    
    // Scale to fit within drawing area
    const drawingHeight = svgHeight - 2 * margin - 60;
    const verticalScale = drawingHeight / rlRange;
    
    // Base Y position (for minimum RL)
    const baseY = svgHeight - margin - 40;

    let svgContent = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Define styles
    svgContent += `
        <defs>
            <style>
                .dimension-line { stroke: #2c3e50; stroke-width: 1; fill: none; }
                .dimension-text { font-family: Arial, sans-serif; font-size: 11px; fill: #2c3e50; text-anchor: middle; }
                .ramp-line { stroke: #2c3e50; stroke-width: 3; fill: none; }
                .rl-marker { fill: #dc3545; stroke: #2c3e50; stroke-width: 1; }
                .datum-line { stroke: #689f38; stroke-width: 1; stroke-dasharray: 5,5; }
                .datum-text { font-family: Arial, sans-serif; font-size: 10px; fill: #689f38; text-anchor: start; }
                .chainage-text { font-family: Arial, sans-serif; font-size: 10px; fill: #689f38; text-anchor: middle; }
                .vertical-datum-line { stroke: #689f38; stroke-width: 1; stroke-dasharray: 3,3; }
                .title-text { font-family: Arial, sans-serif; font-size: 16px; fill: #2c3e50; text-anchor: middle; font-weight: bold; }
                .subtitle-text { font-family: Arial, sans-serif; font-size: 10px; fill: #666; text-anchor: middle; }
            </style>
        </defs>
    `;

    // Add white background
    svgContent += `<rect width="${svgWidth}" height="${svgHeight}" fill="white"/>`;

    // Add title and metadata
    svgContent += `<text x="${svgWidth/2}" y="25" class="title-text">Ramp Section View</text>`;

    // Draw road line connecting all points
    let pathData = '';
    points.forEach((point, index) => {
        const x = margin + point.x * horizontalScale;
        const y = baseY - (point.rl - minRL) * verticalScale;
        
        if (index === 0) {
            pathData += `M ${x} ${y}`;
        } else {
            pathData += ` L ${x} ${y}`;
        }
    });
    
    svgContent += `<path d="${pathData}" class="ramp-line"/>`;

    // Calculate datum line position for reference
    const datumY = baseY - (startingRL - minRL) * verticalScale;
    
    // Draw RL markers and labels at each point
    points.forEach((point, index) => {
        const x = margin + point.x * horizontalScale;
        const y = baseY - (point.rl - minRL) * verticalScale;
        
        // RL marker
        svgContent += `<circle cx="${x}" cy="${y}" r="4" class="rl-marker"/>`;
        
        // RL label (positioned above the ramp node)
        const rlText = `RL ${point.rl >= 0 ? '+' : ''}${point.rl.toFixed(3)}`;
        svgContent += `<text x="${x}" y="${y - 15}" class="dimension-text" font-weight="bold">${rlText}</text>`;
        
        // Vertical dashed green line from datum to ramp node
        svgContent += `<line x1="${x}" y1="${datumY}" x2="${x}" y2="${y}" class="vertical-datum-line"/>`;
        
        // Chainage label positioned below datum line (skip first point which is at 0)
        if (index > 0) {
            svgContent += `<text x="${x}" y="${datumY + 20}" class="chainage-text">CH${point.x.toFixed(1)}m</text>`;
        }
    });

    // Add start and end labels
    const startX = margin + points[0].x * horizontalScale;
    const startY = baseY - (points[0].rl - minRL) * verticalScale;
    const endX = margin + points[points.length - 1].x * horizontalScale;
    const endY = baseY - (points[points.length - 1].rl - minRL) * verticalScale;
    
    svgContent += `<text x="${startX}" y="${startY - 30}" class="dimension-text" font-weight="bold">${startLabel}</text>`;
    svgContent += `<text x="${endX}" y="${endY - 30}" class="dimension-text" font-weight="bold">${endLabel}</text>`;

    // Add horizontal dimensions for each segment
    let currentX = margin;
    segmentData.forEach((segment, index) => {
        const segmentWidth = segment.length * horizontalScale;
        const nextX = currentX + segmentWidth;
        
        // Dimension line
        svgContent += `<line x1="${currentX}" y1="${svgHeight - 30}" x2="${nextX}" y2="${svgHeight - 30}" class="dimension-line"/>`;
        svgContent += `<line x1="${currentX}" y1="${svgHeight - 35}" x2="${currentX}" y2="${svgHeight - 25}" class="dimension-line"/>`;
        svgContent += `<line x1="${nextX}" y1="${svgHeight - 35}" x2="${nextX}" y2="${svgHeight - 25}" class="dimension-line"/>`;
        svgContent += `<text x="${(currentX + nextX) / 2}" y="${svgHeight - 38}" class="dimension-text">${segment.length}m</text>`;
        
        // Add grade label below the ramp line
        const midX = (currentX + nextX) / 2;
        const startY = baseY - (points[index].rl - minRL) * verticalScale;
        const endY = baseY - (points[index + 1].rl - minRL) * verticalScale;
        const midY = (startY + endY) / 2;
        
        let gradeText;
        if (segment.gradePercent === 0) {
            gradeText = '0%';
        } else {
            if (gradeType === 'percent') {
                gradeText = `${segment.gradePercent.toFixed(1)}%`;
            } else {
                const ratio = Math.abs(segment.gradePercent) > 0 ? (100 / Math.abs(segment.gradePercent)).toFixed(0) : '∞';
                gradeText = `1:${ratio}`;
            }
        }
        svgContent += `<text x="${midX}" y="${midY + 20}" class="dimension-text" fill="#667eea" font-weight="bold">${gradeText}</text>`;
        
        currentX = nextX;
    });

    // Add datum line reference - FIXED VERSION
    svgContent += `<line x1="${margin - 20}" y1="${datumY}" x2="${svgWidth - margin + 20}" y2="${datumY}" class="datum-line"/>`;

    svgContent += '</svg>';
    return svgContent;
}

function generatePlanView(segmentData, width, gradeType) {
    const svgWidth = 1000;
    const svgHeight = 400;
    const margin = 50;
    
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    const scale = Math.min((svgWidth - 2 * margin) / totalLength, (svgHeight - 2 * margin) / width);
    const widthScale = width * scale;

    let svgContent = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Define styles
    svgContent += `
        <defs>
            <style>
                .dimension-line { stroke: #2c3e50; stroke-width: 1; fill: none; }
                .dimension-text { font-family: Arial, sans-serif; font-size: 11px; fill: #2c3e50; text-anchor: middle; }
                .ramp-surface { fill: #e9ecef; stroke: #2c3e50; stroke-width: 2; }
                .landing-surface { fill: #f0f0f0; stroke: #2c3e50; stroke-width: 2; }
                .grade-arrow { stroke: #667eea; stroke-width: 2; fill: none; }
                .title-text { font-family: Arial, sans-serif; font-size: 16px; fill: #2c3e50; text-anchor: middle; font-weight: bold; }
                .subtitle-text { font-family: Arial, sans-serif; font-size: 10px; fill: #666; text-anchor: middle; }
            </style>
        </defs>
    `;

    // Add white background
    svgContent += `<rect width="${svgWidth}" height="${svgHeight}" fill="white"/>`;

    // Add title and metadata
    svgContent += `<text x="${svgWidth/2}" y="25" class="title-text">Ramp Plan View</text>`;

    const centerY = svgHeight / 2;
    let currentX = margin;

    segmentData.forEach((segment, index) => {
        const segmentWidth = segment.length * scale;
        const nextX = currentX + segmentWidth;

        // Draw segment
        if (segment.gradePercent === 0) {
            svgContent += `<rect x="${currentX}" y="${centerY - widthScale/2}" width="${segmentWidth}" height="${widthScale}" class="landing-surface"/>`;
        } else {
            svgContent += `<rect x="${currentX}" y="${centerY - widthScale/2}" width="${segmentWidth}" height="${widthScale}" class="ramp-surface"/>`;
            
            // Add horizontal arrow pointing to higher end for sloped segments
            const arrowY = centerY;
            const arrowLength = Math.min(25, segmentWidth * 0.3);
            
            if (segment.gradePercent > 0) {
                const arrowEndX = nextX - 5;
                const arrowStartX = arrowEndX - arrowLength;
                
                svgContent += `<line x1="${arrowStartX}" y1="${arrowY}" x2="${arrowEndX}" y2="${arrowY}" class="grade-arrow"/>`;
                svgContent += `<polygon points="${arrowEndX},${arrowY} ${arrowEndX - 8},${arrowY - 4} ${arrowEndX - 8},${arrowY + 4}" fill="#667eea"/>`;
                
            } else if (segment.gradePercent < 0) {
                const arrowEndX = currentX + 5;
                const arrowStartX = arrowEndX + arrowLength;
                
                svgContent += `<line x1="${arrowStartX}" y1="${arrowY}" x2="${arrowEndX}" y2="${arrowY}" class="grade-arrow"/>`;
                svgContent += `<polygon points="${arrowEndX},${arrowY} ${arrowEndX + 8},${arrowY - 4} ${arrowEndX + 8},${arrowY + 4}" fill="#667eea"/>`;
            }
        }

        // Add dimensions with grade information
        let dimensionText;
        if (segment.gradePercent === 0) {
            dimensionText = `${segment.length}m @ 0%`;
        } else {
            if (gradeType === 'percent') {
                dimensionText = `${segment.length}m @ ${segment.gradePercent.toFixed(1)}%`;
            } else {
                const ratio = Math.abs(segment.gradePercent) > 0 ? (100 / Math.abs(segment.gradePercent)).toFixed(0) : '∞';
                dimensionText = `${segment.length}m @ 1:${ratio}`;
            }
        }
        
        // Dimension line
        const dimY = centerY + widthScale/2 + 30;
        svgContent += `<line x1="${currentX}" y1="${dimY}" x2="${nextX}" y2="${dimY}" class="dimension-line"/>`;
        svgContent += `<line x1="${currentX}" y1="${dimY - 5}" x2="${currentX}" y2="${dimY + 5}" class="dimension-line"/>`;
        svgContent += `<line x1="${nextX}" y1="${dimY - 5}" x2="${nextX}" y2="${dimY + 5}" class="dimension-line"/>`;
        svgContent += `<text x="${(currentX + nextX) / 2}" y="${dimY - 8}" class="dimension-text">${dimensionText}</text>`;

        currentX = nextX;
    });

    // Add width dimension
    const widthDimX = margin - 40;
    svgContent += `<line x1="${widthDimX}" y1="${centerY - widthScale/2}" x2="${widthDimX}" y2="${centerY + widthScale/2}" class="dimension-line"/>`;
    svgContent += `<line x1="${widthDimX - 5}" y1="${centerY - widthScale/2}" x2="${widthDimX + 5}" y2="${centerY - widthScale/2}" class="dimension-line"/>`;
    svgContent += `<line x1="${widthDimX - 5}" y1="${centerY + widthScale/2}" x2="${widthDimX + 5}" y2="${centerY + widthScale/2}" class="dimension-line"/>`;
    svgContent += `<text x="${widthDimX + 15}" y="${centerY + 3}" class="dimension-text" text-anchor="start">${width}m</text>`;

    svgContent += '</svg>';
    return svgContent;
}

function generateAutoCADScript(params) {
    const { type, segmentData, width, startingRL, startLabel, endLabel, gradeType } = params;
    
    if (type === 'section') {
        return generateSectionAutoCADScript(segmentData, width, startingRL, startLabel, endLabel, gradeType);
    } else if (type === 'plan') {
        return generatePlanAutoCADScript(segmentData, width, gradeType);
    } else {
        throw new Error('Invalid export type');
    }
}

function generateDWFScript(params) {
    const { type, segmentData, width, startingRL, startLabel, endLabel, gradeType } = params;
    
    // DWF format is essentially a modified AutoCAD script with DWF-specific commands
    let script = generateAutoCADScript(params);
    
    // Add DWF-specific export commands
    script += '\n; Export to DWF format\n';
    script += 'PLOT\n';
    script += 'Y\n'; // Detailed plot configuration
    script += 'DWF6 ePlot.pc3\n'; // DWF plotter
    script += 'ANSI A (8.50 x 11.00 Inches)\n'; // Paper size
    script += 'I\n'; // Inches
    script += 'L\n'; // Landscape
    script += 'N\n'; // No plot upside down
    script += 'E\n'; // Extents
    script += 'F\n'; // Fit to paper
    script += 'C\n'; // Center plot
    script += 'Y\n'; // Plot with plot styles
    script += 'Y\n'; // Plot paperspace last
    script += 'N\n'; // Do not hide paperspace objects
    script += `ramp_${type}.dwf\n`; // Output filename
    script += 'Y\n'; // Save changes to page setup
    script += 'Y\n'; // Proceed with plot
    
    return script;
}

async function generatePDFExport(params) {
    const { type, segmentData, width, startingRL, startLabel, endLabel, gradeType } = params;
    
    // Get the SVG content
    let svgContent;
    if (type === 'section') {
        svgContent = generateSectionView(segmentData, width, startingRL, startLabel, endLabel, gradeType);
    } else {
        svgContent = generatePlanView(segmentData, width, gradeType);
    }
    
    let browser = null;
    
    try {
        // Launch browser with hosted chromium binary
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--hide-scrollbars',
                '--disable-web-security'
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(
                'https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
            ),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        const page = await browser.newPage();
        
        // Create HTML with embedded SVG optimized for PDF
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    html, body {
                        width: 210mm;  /* A4 width */
                        background: white;
                        font-family: Arial, sans-serif;
                        color: #000;
                    }
                    .page {
                        width: 210mm;
                        min-height: 297mm; /* A4 height */
                        padding: 15mm;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: flex-start;
                        page-break-after: avoid;
                    }
                    .header {
                        width: 100%;
                        text-align: center;
                        margin-bottom: 10mm;
                        border-bottom: 1px solid #ccc;
                        padding-bottom: 5mm;
                    }
                    .header h1 {
                        font-size: 18pt;
                        font-weight: bold;
                        margin-bottom: 2mm;
                        color: #2c3e50;
                    }
                    .header p {
                        font-size: 10pt;
                        color: #666;
                        margin: 1mm 0;
                    }
                    .drawing-container {
                        width: 100%;
                        max-width: 180mm;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        margin: 10mm 0;
                        border: 1px solid #ddd;
                        border-radius: 2mm;
                        padding: 5mm;
                        background: #fafafa;
                    }
                    svg {
                        max-width: 100%;
                        height: auto;
                        background: white;
                        border-radius: 1mm;
                    }
                    .metadata {
                        width: 100%;
                        margin-top: 10mm;
                        font-size: 9pt;
                        color: #666;
                    }
                    .metadata table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 5mm;
                    }
                    .metadata th, .metadata td {
                        padding: 2mm;
                        text-align: left;
                        border-bottom: 1px solid #eee;
                    }
                    .metadata th {
                        background: #f5f5f5;
                        font-weight: bold;
                    }
                    .footer {
                        margin-top: auto;
                        width: 100%;
                        text-align: center;
                        font-size: 8pt;
                        color: #999;
                        border-top: 1px solid #eee;
                        padding-top: 5mm;
                    }
                    @media print {
                        body { -webkit-print-color-adjust: exact; }
                        .page { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <div class="page">
                    <div class="header">
                        <h1>Ramp Design - ${type.charAt(0).toUpperCase() + type.slice(1)} View</h1>
                        <p>Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                        <p>Multi-Segment Ramp Design Tool</p>
                    </div>
                    
                    <div class="drawing-container">
                        ${svgContent}
                    </div>
                    
                    <div class="metadata">
                        <h3>Design Parameters</h3>
                        <table>
                            <tr><th>Parameter</th><th>Value</th></tr>
                            <tr><td>Ramp Width</td><td>${width}m</td></tr>
                            <tr><td>Starting RL</td><td>${startingRL.toFixed(3)}m</td></tr>
                            <tr><td>Start Location</td><td>${startLabel}</td></tr>
                            <tr><td>End Location</td><td>${endLabel}</td></tr>
                            <tr><td>Total Length</td><td>${segmentData.reduce((sum, seg) => sum + seg.length, 0).toFixed(1)}m</td></tr>
                            <tr><td>Number of Segments</td><td>${segmentData.length}</td></tr>
                            <tr><td>Total Rise</td><td>${segmentData.reduce((sum, seg) => sum + seg.rise, 0).toFixed(3)}m</td></tr>
                        </table>
                        
                        <h3 style="margin-top: 5mm;">Segment Details</h3>
                        <table>
                            <tr><th>Segment</th><th>Length (m)</th><th>Grade (%)</th><th>Rise (m)</th></tr>
                            ${segmentData.map((seg, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${seg.length.toFixed(1)}</td>
                                    <td>${seg.gradePercent.toFixed(1)}%</td>
                                    <td>${seg.rise.toFixed(3)}</td>
                                </tr>
                            `).join('')}
                        </table>
                    </div>
                    
                    <div class="footer">
                        <p>This document was automatically generated by the Multi-Segment Ramp Design Tool</p>
                        <p>For technical support or questions, please contact your system administrator</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        // Set content and wait for it to load
        await page.setContent(html, { 
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        // Wait for fonts and rendering to complete
        await page.waitForTimeout(1000);
        
        // Generate PDF with A4 settings
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm'
            },
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size: 8pt; color: #666; width: 100%; text-align: center; margin-top: 5mm;">
                    <span>Ramp Design - ${type.charAt(0).toUpperCase() + type.slice(1)} View</span>
                </div>
            `,
            footerTemplate: `
                <div style="font-size: 8pt; color: #666; width: 100%; text-align: center; margin-bottom: 5mm;">
                    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> | Generated: ${new Date().toLocaleDateString()}</span>
                </div>
            `,
            preferCSSPageSize: true,
            quality: 100
        });
        
        return pdfBuffer.toString('base64');
        
    } catch (error) {
        console.error('PDF generation error:', error);
        
        // Provide specific error messages
        if (error.message.includes('timeout')) {
            throw new Error('PDF generation timed out. Please try again or use SVG export.');
        } else if (error.message.includes('memory')) {
            throw new Error('Insufficient memory for PDF generation. Please use SVG export.');
        } else if (error.message.includes('libnspr4') || error.message.includes('shared libraries')) {
            throw new Error('Browser dependencies missing. Please try again or use SVG export.');
        } else {
            throw new Error(`PDF generation failed: ${error.message}`);
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.error('Error closing browser:', closeError);
            }
        }
    }
}

function generateSectionAutoCADScript(segmentData, width, startingRL, startLabel, endLabel, gradeType) {
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    
    // Calculate points
    let currentElevation = startingRL;
    const points = [{x: 0, rl: startingRL}];
    let cumulativeLength = 0;
    
    segmentData.forEach(segment => {
        cumulativeLength += segment.length;
        currentElevation += segment.rise;
        points.push({x: cumulativeLength, rl: currentElevation});
    });

    // Convert all measurements to mm for AutoCAD
    const pointsMM = points.map(p => ({
        x: p.x * 1000,
        rl: p.rl * 1000
    }));
    const segmentsMM = segmentData.map(s => ({
        ...s,
        length: s.length * 1000,
        rise: s.rise * 1000
    }));

    let script = '; AutoCAD Script File - Ramp Section View\n';
    script += '; Generated by Multi-Segment Ramp Design Tool\n';
    script += `; Generated: ${new Date().toISOString()}\n`;
    script += '; All measurements in millimeters\n';
    script += '\n';
    
    // Set units and precision
    script += 'UNITS 2 1 1 2 0 N\n';
    script += 'ZOOM E\n';
    script += '\n';

    // Create layers
    script += 'LAYER N RAMP-PROFILE C 7 RAMP-PROFILE\n';
    script += 'LAYER N RAMP-DIMENSIONS C 3 RAMP-DIMENSIONS\n';
    script += 'LAYER N RAMP-TEXT C 1 RAMP-TEXT\n';
    script += 'LAYER N RAMP-REFERENCE C 2 RAMP-REFERENCE\n';
    script += '\n';

    // Draw the main ramp profile line
    script += 'LAYER S RAMP-PROFILE\n';
    script += 'PLINE\n';
    pointsMM.forEach((point, index) => {
        script += `${point.x.toFixed(1)},${point.rl.toFixed(1)}\n`;
    });
    script += '\n';
    script += '\n';

    // Add RL markers
    pointsMM.forEach((point, index) => {
        script += `CIRCLE ${point.x.toFixed(1)},${point.rl.toFixed(1)} 100\n`;
    });
    script += '\n';

    // Add RL text labels
    script += 'LAYER S RAMP-TEXT\n';
    pointsMM.forEach((point, index) => {
        const rlText = `RL ${point.rl >= 0 ? '+' : ''}${point.rl.toFixed(1)}`;
        script += `TEXT ${point.x.toFixed(1)},${(point.rl + 300).toFixed(1)} 150 0 ${rlText}\n`;
        
        if (index > 0) {
            script += `TEXT ${point.x.toFixed(1)},${(point.rl - 400).toFixed(1)} 120 0 ${point.x.toFixed(0)}mm\n`;
        }
    });
    script += '\n';

    // Add start and end labels
    const startPoint = pointsMM[0];
    const endPoint = pointsMM[pointsMM.length - 1];
    script += `TEXT ${startPoint.x.toFixed(1)},${(startPoint.rl + 600).toFixed(1)} 180 0 ${startLabel}\n`;
    script += `TEXT ${endPoint.x.toFixed(1)},${(endPoint.rl + 600).toFixed(1)} 180 0 ${endLabel}\n`;
    script += '\n';

    // Add grade labels
    segmentsMM.forEach((segment, index) => {
        const startPoint = pointsMM[index];
        const endPoint = pointsMM[index + 1];
        const midX = (startPoint.x + endPoint.x) / 2;
        const midRL = (startPoint.rl + endPoint.rl) / 2;
        
        let gradeText;
        if (segment.gradePercent === 0) {
            gradeText = '0%';
        } else {
            if (gradeType === 'percent') {
                gradeText = `${segment.gradePercent.toFixed(1)}%`;
            } else {
                const ratio = Math.abs(segment.gradePercent) > 0 ? (100 / Math.abs(segment.gradePercent)).toFixed(0) : '∞';
                gradeText = `1:${ratio}`;
            }
        }
        script += `TEXT ${midX.toFixed(1)},${(midRL + 150).toFixed(1)} 120 0 ${gradeText}\n`;
    });
    script += '\n';

    // Add horizontal dimension lines
    script += 'LAYER S RAMP-DIMENSIONS\n';
    const dimY = Math.min(...pointsMM.map(p => p.rl)) - 1000;
    
    segmentsMM.forEach((segment, index) => {
        const startX = pointsMM[index].x;
        const endX = pointsMM[index + 1].x;
        
        script += `LINE ${startX.toFixed(1)},${dimY.toFixed(1)} ${endX.toFixed(1)},${dimY.toFixed(1)}\n`;
        script += `LINE ${startX.toFixed(1)},${(dimY - 100).toFixed(1)} ${startX.toFixed(1)},${(dimY + 100).toFixed(1)}\n`;
        script += `LINE ${endX.toFixed(1)},${(dimY - 100).toFixed(1)} ${endX.toFixed(1)},${(dimY + 100).toFixed(1)}\n`;
        
        const midX = (startX + endX) / 2;
        script += `TEXT ${midX.toFixed(1)},${(dimY - 300).toFixed(1)} 120 0 ${segment.length.toFixed(0)}mm\n`;
    });
    script += '\n';

    // Add datum reference line
    script += 'LAYER S RAMP-REFERENCE\n';
    const datumY = startingRL * 1000;
    const totalLengthMM = totalLength * 1000;
    const lineStart = -totalLengthMM * 0.1;
    const lineEnd = totalLengthMM * 1.1;
    script += `LINE ${lineStart.toFixed(1)},${datumY.toFixed(1)} ${lineEnd.toFixed(1)},${datumY.toFixed(1)}\n`;
    script += 'LINETYPE S DASHED\n';
    script += `LINE ${lineStart.toFixed(1)},${datumY.toFixed(1)} ${lineEnd.toFixed(1)},${datumY.toFixed(1)}\n`;
    script += 'LINETYPE S CONTINUOUS\n';
    script += `TEXT ${lineStart.toFixed(1)},${(datumY + 150).toFixed(1)} 120 0 RL ${datumY.toFixed(1)}\n`;
    script += '\n';

    script += 'ZOOM E\n';
    script += 'LAYER S RAMP-PROFILE\n';

    return script;
}

function generatePlanAutoCADScript(segmentData, width, gradeType) {
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    const totalLengthMM = totalLength * 1000;
    const widthMM = width * 1000;
    const segmentsMM = segmentData.map(s => ({
        ...s,
        length: s.length * 1000
    }));

    let script = '; AutoCAD Script File - Ramp Plan View\n';
    script += '; Generated by Multi-Segment Ramp Design Tool\n';
    script += `; Generated: ${new Date().toISOString()}\n`;
    script += '; All measurements in millimeters\n';
    script += '\n';
    
    script += 'UNITS 2 1 1 2 0 N\n';
    script += 'ZOOM E\n';
    script += '\n';

    // Create layers
    script += 'LAYER N RAMP-OUTLINE C 7 RAMP-OUTLINE\n';
    script += 'LAYER N RAMP-DIMENSIONS C 3 RAMP-DIMENSIONS\n';
    script += 'LAYER N RAMP-TEXT C 1 RAMP-TEXT\n';
    script += 'LAYER N RAMP-ARROWS C 4 RAMP-ARROWS\n';
    script += 'LAYER N RAMP-LANDING C 6 RAMP-LANDING\n';
    script += '\n';

    // Draw each segment
    let currentX = 0;
    const centerY = 0;

    segmentsMM.forEach((segment, index) => {
        const segmentWidthMM = segment.length;
        const nextX = currentX + segmentWidthMM;

        if (segment.gradePercent === 0) {
            script += 'LAYER S RAMP-LANDING\n';
        } else {
            script += 'LAYER S RAMP-OUTLINE\n';
        }

        script += `RECTANG ${currentX.toFixed(1)},${(centerY - widthMM/2).toFixed(1)} ${nextX.toFixed(1)},${(centerY + widthMM/2).toFixed(1)}\n`;

        // Add arrows for sloped segments
        if (segment.gradePercent !== 0) {
            script += 'LAYER S RAMP-ARROWS\n';
            const arrowLength = 250;
            
            if (segment.gradePercent > 0) {
                const arrowEndX = nextX - 50;
                const arrowStartX = arrowEndX - arrowLength;
                
                script += `LINE ${arrowStartX.toFixed(1)},${centerY.toFixed(1)} ${arrowEndX.toFixed(1)},${centerY.toFixed(1)}\n`;
                script += `LINE ${arrowEndX.toFixed(1)},${centerY.toFixed(1)} ${(arrowEndX - 80).toFixed(1)},${(centerY - 40).toFixed(1)}\n`;
                script += `LINE ${arrowEndX.toFixed(1)},${centerY.toFixed(1)} ${(arrowEndX - 80).toFixed(1)},${(centerY + 40).toFixed(1)}\n`;
                
            } else if (segment.gradePercent < 0) {
                const arrowEndX = currentX + 50;
                const arrowStartX = arrowEndX + arrowLength;
                
                script += `LINE ${arrowStartX.toFixed(1)},${centerY.toFixed(1)} ${arrowEndX.toFixed(1)},${centerY.toFixed(1)}\n`;
                script += `LINE ${arrowEndX.toFixed(1)},${centerY.toFixed(1)} ${(arrowEndX + 80).toFixed(1)},${(centerY - 40).toFixed(1)}\n`;
                script += `LINE ${arrowEndX.toFixed(1)},${centerY.toFixed(1)} ${(arrowEndX + 80).toFixed(1)},${(centerY + 40).toFixed(1)}\n`;
            }
        }

        currentX = nextX;
    });
    script += '\n';

    // Add longitudinal dimensions
    script += 'LAYER S RAMP-DIMENSIONS\n';
    const dimY = centerY + widthMM/2 + 300;
    
    currentX = 0;
    segmentsMM.forEach((segment, index) => {
        const nextX = currentX + segment.length;
        
        script += `LINE ${currentX.toFixed(1)},${dimY.toFixed(1)} ${nextX.toFixed(1)},${dimY.toFixed(1)}\n`;
        script += `LINE ${currentX.toFixed(1)},${(dimY - 50).toFixed(1)} ${currentX.toFixed(1)},${(dimY + 50).toFixed(1)}\n`;
        script += `LINE ${nextX.toFixed(1)},${(dimY - 50).toFixed(1)} ${nextX.toFixed(1)},${(dimY + 50).toFixed(1)}\n`;
        
        const midX = (currentX + nextX) / 2;
        let dimensionText;
        if (segment.gradePercent === 0) {
            dimensionText = `${segment.length.toFixed(0)}mm @ 0%`;
        } else {
            if (gradeType === 'percent') {
                dimensionText = `${segment.length.toFixed(0)}mm @ ${segment.gradePercent.toFixed(1)}%`;
            } else {
                const ratio = Math.abs(segment.gradePercent) > 0 ? (100 / Math.abs(segment.gradePercent)).toFixed(0) : '∞';
                dimensionText = `${segment.length.toFixed(0)}mm @ 1:${ratio}`;
            }
        }
        
        script += `TEXT ${midX.toFixed(1)},${(dimY + 150).toFixed(1)} 120 0 ${dimensionText}\n`;
        
        currentX = nextX;
    });
    script += '\n';

    // Add width dimension
    script += 'LAYER S RAMP-DIMENSIONS\n';
    const widthDimX = -400;
    
    script += `LINE ${widthDimX.toFixed(1)},${(centerY - widthMM/2).toFixed(1)} ${widthDimX.toFixed(1)},${(centerY + widthMM/2).toFixed(1)}\n`;
    script += `LINE ${(widthDimX - 50).toFixed(1)},${(centerY - widthMM/2).toFixed(1)} ${(widthDimX + 50).toFixed(1)},${(centerY - widthMM/2).toFixed(1)}\n`;
    script += `LINE ${(widthDimX - 50).toFixed(1)},${(centerY + widthMM/2).toFixed(1)} ${(widthDimX + 50).toFixed(1)},${(centerY + widthMM/2).toFixed(1)}\n`;
    
    script += `TEXT ${(widthDimX + 150).toFixed(1)},${centerY.toFixed(1)} 120 0 ${widthMM.toFixed(0)}mm\n`;
    script += '\n';

    // Add title
    script += 'LAYER S RAMP-TEXT\n';
    script += `TEXT ${(totalLengthMM/2).toFixed(1)},${(centerY + widthMM/2 + 800).toFixed(1)} 200 0 RAMP PLAN VIEW\n`;
    script += `TEXT ${(totalLengthMM/2).toFixed(1)},${(centerY + widthMM/2 + 1100).toFixed(1)} 150 0 Total Length: ${totalLengthMM.toFixed(0)}mm\n`;
    script += '\n';

    script += 'ZOOM E\n';
    script += 'LAYER S RAMP-OUTLINE\n';

    return script;
}