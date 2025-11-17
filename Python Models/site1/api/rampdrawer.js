export default async function handler(req, res) {
    // Set headers for CORS and caching
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Authentication is handled by the Lambda wrapper (simulation-wrapper.js)
        // No need to check auth here

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

/**
 * Format distance value according to units setting and decimal places
 */
function formatDistance(value, units, precision) {
    if (units === 'mm') {
        return (value * 1000).toFixed(precision);
    }
    return value.toFixed(precision);
}

/**
 * Get distance unit suffix
 */
function getDistanceUnit(units) {
    return units === 'mm' ? 'mm' : 'm';
}

/**
 * Format grade for display based on display setting and decimal places
 */
function formatGrade(gradePercent, displayType, precision = 1) {
    if (displayType === 'ratio') {
        if (gradePercent === 0) return '∞';
        const ratio = Math.abs(100 / gradePercent);
        return `1:${ratio.toFixed(precision)}`;
    }
    return `${gradePercent.toFixed(precision)}%`;
}

/**
 * Format chainage label with proper positioning and decimal places
 */
function formatChainageLabel(value, units, precision, prefix, position) {
    const formattedValue = formatDistance(value, units, precision);
    const unit = getDistanceUnit(units);
    
    if (position === 'suffix') {
        return `${formattedValue}${unit} ${prefix}`;
    } else {
        return `${prefix}${formattedValue}${unit}`;
    }
}

function generateDrawings(params) {
    const {
        segmentData,
        width,
        startingRL,
        startingChainage = 0,
        startLabel,
        endLabel,
        gradeType,
        chainagePrefix = 'CH',
        chainagePosition = 'prefix',
        chainageDecimalPlaces = 1,
        rlDecimalPlaces = 3,
        gradeDecimalPlaces = 1,
        distanceUnits = 'm',
        gradeDisplay = 'percent',
        sectionSubtitle = '',
        planSubtitle = '',
        // Old combined parameters (for backward compatibility)
        showRL = true,
        showCH = true,
        showGrade = true,
        showLength = true,
        showWidth = true,
        // New separate section/plan parameters
        showRLSection,
        showRLPlan,
        showCHSection,
        showCHPlan,
        showGradeSection,
        showGradePlan,
        showLengthSection,
        showLengthPlan,
        showWidthSection,
        showWidthPlan
    } = params;

    // Use new parameters if provided, otherwise fall back to old combined parameters
    const sectionShowRL = showRLSection !== undefined ? showRLSection : showRL;
    const sectionShowCH = showCHSection !== undefined ? showCHSection : showCH;
    const sectionShowGrade = showGradeSection !== undefined ? showGradeSection : showGrade;
    const sectionShowLength = showLengthSection !== undefined ? showLengthSection : showLength;

    const planShowRL = showRLPlan !== undefined ? showRLPlan : showRL;
    const planShowCH = showCHPlan !== undefined ? showCHPlan : showCH;
    const planShowGrade = showGradePlan !== undefined ? showGradePlan : showGrade;
    const planShowLength = showLengthPlan !== undefined ? showLengthPlan : showLength;
    const planShowWidth = showWidthPlan !== undefined ? showWidthPlan : showWidth;

    const sectionSvg = generateSectionView(segmentData, width, startingRL, startingChainage, startLabel, endLabel, gradeType, chainagePrefix, chainagePosition, chainageDecimalPlaces, rlDecimalPlaces, gradeDecimalPlaces, distanceUnits, gradeDisplay, sectionSubtitle, sectionShowRL, sectionShowCH, sectionShowGrade, sectionShowLength);
    const planSvg = generatePlanView(segmentData, width, gradeType, chainageDecimalPlaces, gradeDecimalPlaces, distanceUnits, gradeDisplay, startingRL, startingChainage, chainagePrefix, chainagePosition, rlDecimalPlaces, planSubtitle, planShowRL, planShowCH, planShowGrade, planShowLength, planShowWidth);

    return {
        sectionSvg,
        planSvg
    };
}

async function generateFileExport(params) {
    const { type, format } = params;
    
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
    const { type } = params;

    // Get the raw SVG content
    let svgContent;
    if (type === 'section') {
        svgContent = generateSectionView(
            params.segmentData,
            params.width,
            params.startingRL,
            params.startingChainage || 0,
            params.startLabel,
            params.endLabel,
            params.gradeType,
            params.chainagePrefix || 'CH',
            params.chainagePosition || 'prefix',
            params.chainageDecimalPlaces || 1,
            params.rlDecimalPlaces || 3,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent',
            params.sectionSubtitle || '',
            params.showRL !== undefined ? params.showRL : true,
            params.showCH !== undefined ? params.showCH : true,
            params.showGrade !== undefined ? params.showGrade : true,
            params.showLength !== undefined ? params.showLength : true
        );
    } else {
        svgContent = generatePlanView(
            params.segmentData,
            params.width,
            params.gradeType,
            params.chainageDecimalPlaces || 1,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent',
            params.startingRL || 0,
            params.startingChainage || 0,
            params.chainagePrefix || 'CH',
            params.chainagePosition || 'prefix',
            params.rlDecimalPlaces || 3,
            params.planSubtitle || '',
            params.showRL !== undefined ? params.showRL : true,
            params.showCH !== undefined ? params.showCH : true,
            params.showGrade !== undefined ? params.showGrade : true,
            params.showLength !== undefined ? params.showLength : true,
            params.showWidth !== undefined ? params.showWidth : true
        );
    }

    // Create metadata object for roundtrip import
    const metadata = {
        width: params.width,
        startingRL: params.startingRL || 0,
        startingChainage: params.startingChainage || 0,
        startLabel: params.startLabel || '',
        endLabel: params.endLabel || '',
        chainagePrefix: params.chainagePrefix || 'CH',
        chainagePosition: params.chainagePosition || 'prefix',
        chainageDecimalPlaces: params.chainageDecimalPlaces || 1,
        rlDecimalPlaces: params.rlDecimalPlaces || 3,
        gradeDecimalPlaces: params.gradeDecimalPlaces || 1,
        distanceUnits: params.distanceUnits || 'm',
        gradeDisplay: params.gradeDisplay || 'percent',
        sectionSubtitle: params.sectionSubtitle || '',
        planSubtitle: params.planSubtitle || '',
        segments: params.segmentData.map(seg => ({
            length: seg.length,
            grade: seg.gradePercent
        })),
        exportType: type,
        exportDate: new Date().toISOString(),
        tool: 'TrafficLabb Ramp Design Tool'
    };

    // Embed metadata as JSON comment at the start of the SVG
    const metadataComment = `<!--RAMP_DESIGN_METADATA:${JSON.stringify(metadata)}-->`;

    // Insert metadata comment after the opening svg tag
    svgContent = svgContent.replace(/<svg/, `<svg>\n${metadataComment}\n<svg`);
    svgContent = svgContent.replace(/<svg>\s*<!--RAMP_DESIGN_METADATA.*?-->\s*<svg/, `<svg>\n${metadataComment}`);

    // Add XML declaration and make it a complete SVG file
    const completeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
${svgContent}`;

    return completeSvg;
}

async function generatePNGExport(params) {
    const { type } = params;

    // Get the SVG content
    let svgContent;
    if (type === 'section') {
        svgContent = generateSectionView(
            params.segmentData,
            params.width,
            params.startingRL,
            params.startingChainage || 0,
            params.startLabel,
            params.endLabel,
            params.gradeType,
            params.chainagePrefix || 'CH',
            params.chainagePosition || 'prefix',
            params.chainageDecimalPlaces || 1,
            params.rlDecimalPlaces || 3,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent',
            params.sectionSubtitle || '',
            params.showRL !== undefined ? params.showRL : true,
            params.showCH !== undefined ? params.showCH : true,
            params.showGrade !== undefined ? params.showGrade : true,
            params.showLength !== undefined ? params.showLength : true
        );
    } else {
        svgContent = generatePlanView(
            params.segmentData,
            params.width,
            params.gradeType,
            params.chainageDecimalPlaces || 1,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent',
            params.startingRL || 0,
            params.startingChainage || 0,
            params.chainagePrefix || 'CH',
            params.chainagePosition || 'prefix',
            params.rlDecimalPlaces || 3,
            params.planSubtitle || '',
            params.showRL !== undefined ? params.showRL : true,
            params.showCH !== undefined ? params.showCH : true,
            params.showGrade !== undefined ? params.showGrade : true,
            params.showLength !== undefined ? params.showLength : true,
            params.showWidth !== undefined ? params.showWidth : true
        );
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

function generateSectionView(segmentData, width, startingRL, startingChainage = 0, startLabel, endLabel, gradeType, chainagePrefix = 'CH', chainagePosition = 'prefix', chainageDecimalPlaces = 1, rlDecimalPlaces = 3, gradeDecimalPlaces = 1, distanceUnits = 'm', gradeDisplay = 'percent', sectionSubtitle = '', showRL = true, showCH = true, showGrade = true, showLength = true) {
    const svgWidth = 1000;
    const svgHeight = 400;
    const margin = 80; // Increased margin to accommodate datum text
    
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    const horizontalScale = (svgWidth - 2 * margin) / totalLength;
    
    // Calculate all RLs (elevation points) starting from the specified starting RL
    let currentElevation = startingRL;
    const points = [{x: 0, rl: startingRL, chainage: startingChainage}];
    let cumulativeLength = 0;
    
    segmentData.forEach(segment => {
        cumulativeLength += segment.length;
        currentElevation += segment.rise;
        points.push({x: cumulativeLength, rl: currentElevation, chainage: startingChainage + cumulativeLength});
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
    const distanceUnit = getDistanceUnit(distanceUnits);

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
    if (sectionSubtitle) {
        svgContent += `<text x="${svgWidth/2}" y="40" class="subtitle-text">${sectionSubtitle}</text>`;
    }

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
    
    // Calculate vertical offsets for RL labels (stack them when segments are < 1m)
    const labelOffsets = [];
    const baseOffset = 20; // Base distance above node
    const stackSpacing = 18; // Vertical spacing between stacked labels
    let currentStackLevel = 0;

    points.forEach((point, index) => {
        if (index === 0) {
            // First point always at base level
            labelOffsets.push(baseOffset);
            currentStackLevel = 0;
        } else {
            // Check if previous segment is less than 1m
            const previousSegmentLength = segmentData[index - 1]?.length || 0;
            if (previousSegmentLength < 1) {
                // Stack above previous label
                currentStackLevel++;
            } else {
                // Reset to base level
                currentStackLevel = 0;
            }
            labelOffsets.push(baseOffset + (currentStackLevel * stackSpacing));
        }
    });

    // Draw RL markers and labels at each point
    points.forEach((point, index) => {
        const x = margin + point.x * horizontalScale;
        const y = baseY - (point.rl - minRL) * verticalScale;
        const labelOffset = labelOffsets[index];

        // RL marker
        svgContent += `<circle cx="${x}" cy="${y}" r="4" class="rl-marker"/>`;

        if (showRL) {
            // Jogger line from node to label (not touching either)
            const joggerStartY = y - 6; // Start 6px above node
            const joggerEndY = y - labelOffset + 4; // End 4px below label baseline
            svgContent += `<line x1="${x}" y1="${joggerStartY}" x2="${x}" y2="${joggerEndY}" class="dimension-line"/>`;

            // RL label (horizontal, right-justified, positioned above the node)
            const rlText = `RL ${point.rl >= 0 ? '+' : ''}${formatDistance(point.rl, distanceUnits, rlDecimalPlaces)}`;
            svgContent += `<text x="${x - 5}" y="${y - labelOffset}" class="dimension-text" font-weight="bold" text-anchor="end">${rlText}</text>`;
        }

        // Vertical dashed green line from datum to ramp node
        svgContent += `<line x1="${x}" y1="${datumY}" x2="${x}" y2="${y}" class="vertical-datum-line"/>`;

        if (showCH) {
            // Chainage label positioned below datum line - use actual chainage including starting chainage (no units)
            const formattedChainage = formatDistance(point.chainage, distanceUnits, chainageDecimalPlaces);
            const chainageLabel = chainagePosition === 'suffix' ? `${formattedChainage} ${chainagePrefix}` : `${chainagePrefix}${formattedChainage}`;
            svgContent += `<text x="${x}" y="${datumY + 20}" class="chainage-text" dominant-baseline="middle" transform="rotate(90 ${x} ${datumY + 20})">${chainageLabel}</text>`;
        }
    });

    // Add start and end labels (positioned above any stacked RL labels) - only if provided
    if (startLabel || endLabel) {
        const startX = margin + points[0].x * horizontalScale;
        const startY = baseY - (points[0].rl - minRL) * verticalScale;
        const endX = margin + points[points.length - 1].x * horizontalScale;
        const endY = baseY - (points[points.length - 1].rl - minRL) * verticalScale;

        const maxStackHeight = Math.max(...labelOffsets);
        const startEndLabelOffset = maxStackHeight + 15; // Position above any stacked labels

        if (startLabel) {
            svgContent += `<text x="${startX}" y="${startY - startEndLabelOffset}" class="dimension-text" font-weight="bold">${startLabel}</text>`;
        }
        if (endLabel) {
            svgContent += `<text x="${endX}" y="${endY - startEndLabelOffset}" class="dimension-text" font-weight="bold">${endLabel}</text>`;
        }
    }

    // Add horizontal dimensions for each segment
    if (showLength || showGrade) {
        let currentX = margin;
        segmentData.forEach((segment, index) => {
            const segmentWidth = segment.length * horizontalScale;
            const nextX = currentX + segmentWidth;

            if (showLength) {
                // Dimension line
                svgContent += `<line x1="${currentX}" y1="${svgHeight - 30}" x2="${nextX}" y2="${svgHeight - 30}" class="dimension-line"/>`;
                svgContent += `<line x1="${currentX}" y1="${svgHeight - 35}" x2="${currentX}" y2="${svgHeight - 25}" class="dimension-line"/>`;
                svgContent += `<line x1="${nextX}" y1="${svgHeight - 35}" x2="${nextX}" y2="${svgHeight - 25}" class="dimension-line"/>`;
                svgContent += `<text x="${(currentX + nextX) / 2}" y="${svgHeight - 38}" class="dimension-text">${formatDistance(segment.length, distanceUnits, chainageDecimalPlaces)}${distanceUnit}</text>`;
            }

            if (showGrade) {
                // Add grade label below the ramp line - format according to gradeDisplay setting and decimal places
                const midX = (currentX + nextX) / 2;
                const startY = baseY - (points[index].rl - minRL) * verticalScale;
                const endY = baseY - (points[index + 1].rl - minRL) * verticalScale;
                const midY = (startY + endY) / 2;

                const gradeText = formatGrade(segment.gradePercent, gradeDisplay, gradeDecimalPlaces);
                svgContent += `<text x="${midX}" y="${midY + 20}" class="dimension-text" fill="#667eea" font-weight="bold">${gradeText}</text>`;
            }

            currentX = nextX;
        });
    }

    // Add datum line reference - FIXED VERSION
    svgContent += `<line x1="${margin - 20}" y1="${datumY}" x2="${svgWidth - margin + 20}" y2="${datumY}" class="datum-line"/>`;

    svgContent += '</svg>';
    return svgContent;
}

function generatePlanView(segmentData, width, gradeType, chainageDecimalPlaces = 1, gradeDecimalPlaces = 1, distanceUnits = 'm', gradeDisplay = 'percent', startingRL = 0, startingChainage = 0, chainagePrefix = 'CH', chainagePosition = 'prefix', rlDecimalPlaces = 3, planSubtitle = '', showRL = true, showCH = true, showGrade = true, showLength = true, showWidth = true) {
    const svgWidth = 1000;
    const svgHeight = 400;
    const margin = 50;
    
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    const scale = Math.min((svgWidth - 2 * margin) / totalLength, (svgHeight - 2 * margin) / width);
    const widthScale = width * scale;
    const distanceUnit = getDistanceUnit(distanceUnits);

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
                .rl-marker { fill: #dc3545; stroke: #2c3e50; stroke-width: 1; }
                .chainage-text { font-family: Arial, sans-serif; font-size: 10px; fill: #689f38; text-anchor: middle; }
            </style>
        </defs>
    `;

    // Add white background
    svgContent += `<rect width="${svgWidth}" height="${svgHeight}" fill="white"/>`;

    // Add title and metadata
    svgContent += `<text x="${svgWidth/2}" y="25" class="title-text">Ramp Plan View</text>`;
    if (planSubtitle) {
        svgContent += `<text x="${svgWidth/2}" y="40" class="subtitle-text">${planSubtitle}</text>`;
    }

    // Calculate all RLs and chainages for nodes
    let currentElevation = startingRL;
    const points = [{x: 0, rl: startingRL, chainage: startingChainage}];
    let cumulativeLength = 0;

    segmentData.forEach(segment => {
        cumulativeLength += segment.length;
        currentElevation += segment.rise;
        points.push({x: cumulativeLength, rl: currentElevation, chainage: startingChainage + cumulativeLength});
    });

    // Calculate vertical offsets for RL labels (stack them when segments are < 1m)
    const labelOffsets = [];
    const baseOffset = 30; // Base distance above ramp
    const stackSpacing = 18; // Vertical spacing between stacked labels
    let currentStackLevel = 0;

    points.forEach((point, index) => {
        if (index === 0) {
            labelOffsets.push(baseOffset);
            currentStackLevel = 0;
        } else {
            const previousSegmentLength = segmentData[index - 1]?.length || 0;
            if (previousSegmentLength < 1) {
                currentStackLevel++;
            } else {
                currentStackLevel = 0;
            }
            labelOffsets.push(baseOffset + (currentStackLevel * stackSpacing));
        }
    });

    const centerY = svgHeight / 2;
    let currentX = margin;

    // Draw ramp segments
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

        currentX = nextX;
    });

    // Add RL markers and labels at each node (top of ramp)
    if (showRL) {
        points.forEach((point, index) => {
            const x = margin + point.x * scale;
            const y = centerY - widthScale/2; // Top edge of ramp
            const labelOffset = labelOffsets[index];

            // RL marker (small circle)
            svgContent += `<circle cx="${x}" cy="${y}" r="3" class="rl-marker"/>`;

            // Jogger line from node to label
            const joggerStartY = y - 5;
            const joggerEndY = y - labelOffset + 4;
            svgContent += `<line x1="${x}" y1="${joggerStartY}" x2="${x}" y2="${joggerEndY}" class="dimension-line"/>`;

            // RL label (horizontal, right-justified)
            const rlText = `RL ${point.rl >= 0 ? '+' : ''}${formatDistance(point.rl, distanceUnits, rlDecimalPlaces)}`;
            svgContent += `<text x="${x - 5}" y="${y - labelOffset}" class="dimension-text" font-weight="bold" text-anchor="end" font-size="10px">${rlText}</text>`;
        });
    }

    // Add horizontal dimensions for each segment
    const dimY = centerY + widthScale/2 + 40;

    if (showLength || showGrade) {
        let currentX = margin;
        segmentData.forEach((segment, index) => {
            const segmentWidth = segment.length * scale;
            const nextX = currentX + segmentWidth;

            if (showLength || showGrade) {
                // Dimension line
                svgContent += `<line x1="${currentX}" y1="${dimY}" x2="${nextX}" y2="${dimY}" class="dimension-line"/>`;
                svgContent += `<line x1="${currentX}" y1="${dimY - 5}" x2="${currentX}" y2="${dimY + 5}" class="dimension-line"/>`;
                svgContent += `<line x1="${nextX}" y1="${dimY - 5}" x2="${nextX}" y2="${dimY + 5}" class="dimension-line"/>`;

                const midX = (currentX + nextX) / 2;

                // Split length and grade into separate lines
                if (showLength && showGrade) {
                    const formattedLength = formatDistance(segment.length, distanceUnits, chainageDecimalPlaces);
                    const gradeText = formatGrade(segment.gradePercent, gradeDisplay, gradeDecimalPlaces);
                    svgContent += `<text x="${midX}" y="${dimY - 10}" class="dimension-text">${formattedLength}${distanceUnit}</text>`;
                    svgContent += `<text x="${midX}" y="${dimY - 22}" class="dimension-text" fill="#667eea">${gradeText}</text>`;
                } else if (showLength) {
                    const formattedLength = formatDistance(segment.length, distanceUnits, chainageDecimalPlaces);
                    svgContent += `<text x="${midX}" y="${dimY - 10}" class="dimension-text">${formattedLength}${distanceUnit}</text>`;
                } else if (showGrade) {
                    const gradeText = formatGrade(segment.gradePercent, gradeDisplay, gradeDecimalPlaces);
                    svgContent += `<text x="${midX}" y="${dimY - 10}" class="dimension-text" fill="#667eea">${gradeText}</text>`;
                }
            }

            currentX = nextX;
        });
    }

    // Add chainage labels at each node (below dimension line)
    if (showCH) {
        points.forEach((point, index) => {
            const x = margin + point.x * scale;
            const chainageY = dimY + 55; // Position below the dimension line

            const formattedChainage = formatDistance(point.chainage, distanceUnits, chainageDecimalPlaces);
            const chainageLabel = chainagePosition === 'suffix' ? `${formattedChainage} ${chainagePrefix}` : `${chainagePrefix}${formattedChainage}`;
            svgContent += `<text x="${x}" y="${chainageY}" class="chainage-text" font-size="10px" transform="rotate(90 ${x} ${chainageY})">${chainageLabel}</text>`;
        });
    }

    // Add width dimension - format according to distance units and decimal places
    if (showWidth) {
        const widthDimX = margin - 40;
        svgContent += `<line x1="${widthDimX}" y1="${centerY - widthScale/2}" x2="${widthDimX}" y2="${centerY + widthScale/2}" class="dimension-line"/>`;
        svgContent += `<line x1="${widthDimX - 5}" y1="${centerY - widthScale/2}" x2="${widthDimX + 5}" y2="${centerY - widthScale/2}" class="dimension-line"/>`;
        svgContent += `<line x1="${widthDimX - 5}" y1="${centerY + widthScale/2}" x2="${widthDimX + 5}" y2="${centerY + widthScale/2}" class="dimension-line"/>`;
        svgContent += `<text x="${widthDimX + 15}" y="${centerY + 3}" class="dimension-text" text-anchor="start">${formatDistance(width, distanceUnits, chainageDecimalPlaces)}${distanceUnit}</text>`;
    }

    svgContent += '</svg>';
    return svgContent;
}

function generateAutoCADScript(params) {
    const { type } = params;

    // Create metadata object for roundtrip import
    const metadata = {
        width: params.width,
        startingRL: params.startingRL || 0,
        startingChainage: params.startingChainage || 0,
        startLabel: params.startLabel || '',
        endLabel: params.endLabel || '',
        chainagePrefix: params.chainagePrefix || 'CH',
        chainagePosition: params.chainagePosition || 'prefix',
        chainageDecimalPlaces: params.chainageDecimalPlaces || 1,
        rlDecimalPlaces: params.rlDecimalPlaces || 3,
        gradeDecimalPlaces: params.gradeDecimalPlaces || 1,
        distanceUnits: params.distanceUnits || 'm',
        gradeDisplay: params.gradeDisplay || 'percent',
        sectionSubtitle: params.sectionSubtitle || '',
        planSubtitle: params.planSubtitle || '',
        segments: params.segmentData.map(seg => ({
            length: seg.length,
            grade: seg.gradePercent
        })),
        exportType: type,
        exportDate: new Date().toISOString(),
        tool: 'TrafficLabb Ramp Design Tool'
    };

    let script = '';

    // Add metadata as comments at the beginning of the script
    script += '; RAMP_DESIGN_METADATA_START\n';
    script += `; ${JSON.stringify(metadata)}\n`;
    script += '; RAMP_DESIGN_METADATA_END\n';
    script += ';\n';

    if (type === 'section') {
        script += generateSectionAutoCADScript(
            params.segmentData,
            params.width,
            params.startingRL,
            params.startingChainage || 0,
            params.startLabel,
            params.endLabel,
            params.gradeType,
            params.chainagePrefix || 'CH',
            params.chainagePosition || 'prefix',
            params.chainageDecimalPlaces || 1,
            params.rlDecimalPlaces || 3,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent'
        );
    } else if (type === 'plan') {
        script += generatePlanAutoCADScript(
            params.segmentData,
            params.width,
            params.gradeType,
            params.chainageDecimalPlaces || 1,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent'
        );
    } else {
        throw new Error('Invalid export type');
    }

    return script;
}

function generateDWFScript(params) {
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
    script += `ramp_${params.type}.dwf\n`; // Output filename
    script += 'Y\n'; // Save changes to page setup
    script += 'Y\n'; // Proceed with plot
    
    return script;
}

async function generatePDFExport(params) {
    const { type } = params;

    // Get the SVG content
    let svgContent;
    if (type === 'section') {
        svgContent = generateSectionView(
            params.segmentData,
            params.width,
            params.startingRL,
            params.startingChainage || 0,
            params.startLabel,
            params.endLabel,
            params.gradeType,
            params.chainagePrefix || 'CH',
            params.chainagePosition || 'prefix',
            params.chainageDecimalPlaces || 1,
            params.rlDecimalPlaces || 3,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent',
            params.sectionSubtitle || '',
            params.showRL !== undefined ? params.showRL : true,
            params.showCH !== undefined ? params.showCH : true,
            params.showGrade !== undefined ? params.showGrade : true,
            params.showLength !== undefined ? params.showLength : true
        );
    } else {
        svgContent = generatePlanView(
            params.segmentData,
            params.width,
            params.gradeType,
            params.chainageDecimalPlaces || 1,
            params.gradeDecimalPlaces || 1,
            params.distanceUnits || 'm',
            params.gradeDisplay || 'percent',
            params.startingRL || 0,
            params.startingChainage || 0,
            params.chainagePrefix || 'CH',
            params.chainagePosition || 'prefix',
            params.rlDecimalPlaces || 3,
            params.planSubtitle || '',
            params.showRL !== undefined ? params.showRL : true,
            params.showCH !== undefined ? params.showCH : true,
            params.showGrade !== undefined ? params.showGrade : true,
            params.showLength !== undefined ? params.showLength : true,
            params.showWidth !== undefined ? params.showWidth : true
        );
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
                            <tr><td>Ramp Width</td><td>${formatDistance(params.width, params.distanceUnits)}${getDistanceUnit(params.distanceUnits)}</td></tr>
                            <tr><td>Starting RL</td><td>${formatDistance(params.startingRL, params.distanceUnits)}${getDistanceUnit(params.distanceUnits)}</td></tr>
                            <tr><td>Starting Chainage</td><td>${formatDistance(params.startingChainage || 0, params.distanceUnits)}${getDistanceUnit(params.distanceUnits)}</td></tr>
                            <tr><td>Start Location</td><td>${params.startLabel}</td></tr>
                            <tr><td>End Location</td><td>${params.endLabel}</td></tr>
                            <tr><td>Total Length</td><td>${formatDistance(params.segmentData.reduce((sum, seg) => sum + seg.length, 0), params.distanceUnits)}${getDistanceUnit(params.distanceUnits)}</td></tr>
                            <tr><td>Number of Segments</td><td>${params.segmentData.length}</td></tr>
                            <tr><td>Total Rise</td><td>${formatDistance(params.segmentData.reduce((sum, seg) => sum + seg.rise, 0), params.distanceUnits)}${getDistanceUnit(params.distanceUnits)}</td></tr>
                            <tr><td>Distance Units</td><td>${params.distanceUnits === 'mm' ? 'Millimeters' : 'Meters'}</td></tr>
                            <tr><td>Grade Display</td><td>${params.gradeDisplay === 'ratio' ? 'Ratio (1:X)' : 'Percentage (%)'}</td></tr>
                            <tr><td>Chainage Prefix</td><td>${params.chainagePrefix || 'CH'}</td></tr>
                        </table>
                        
                        <h3 style="margin-top: 5mm;">Segment Details</h3>
                        <table>
                            <tr><th>Segment</th><th>Length (${getDistanceUnit(params.distanceUnits)})</th><th>Grade</th><th>Rise (${getDistanceUnit(params.distanceUnits)})</th></tr>
                            ${params.segmentData.map((seg, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${formatDistance(seg.length, params.distanceUnits)}</td>
                                    <td>${formatGrade(seg.gradePercent, params.gradeDisplay)}</td>
                                    <td>${formatDistance(seg.rise, params.distanceUnits)}</td>
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

function generateSectionAutoCADScript(segmentData, width, startingRL, startingChainage = 0, startLabel, endLabel, gradeType, chainagePrefix = 'CH', chainagePosition = 'prefix', chainageDecimalPlaces = 1, rlDecimalPlaces = 3, gradeDecimalPlaces = 1, distanceUnits = 'm', gradeDisplay = 'percent') {
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    
    // Calculate points
    let currentElevation = startingRL;
    const points = [{x: 0, rl: startingRL, chainage: startingChainage}];
    let cumulativeLength = 0;
    
    segmentData.forEach(segment => {
        cumulativeLength += segment.length;
        currentElevation += segment.rise;
        points.push({x: cumulativeLength, rl: currentElevation, chainage: startingChainage + cumulativeLength});
    });

    // Convert measurements to AutoCAD units (always use mm for precision)
    const unitMultiplier = 1000; // Always use mm for AutoCAD for precision
    const pointsCAD = points.map(p => ({
        x: p.x * unitMultiplier,
        rl: p.rl * unitMultiplier,
        chainage: p.chainage
    }));
    const segmentsCAD = segmentData.map(s => ({
        ...s,
        length: s.length * unitMultiplier
    }));

    let script = '; AutoCAD Script File - Ramp Section View\n';
    script += '; Generated by Multi-Segment Ramp Design Tool\n';
    script += `; Generated: ${new Date().toISOString()}\n`;
    script += '; All measurements in millimeters for precision\n';
    script += `; Original units: ${distanceUnits}, Chainage position: ${chainagePosition}, CH decimals: ${chainageDecimalPlaces}, RL decimals: ${rlDecimalPlaces}, Grade decimals: ${gradeDecimalPlaces}\n`;
    script += `; Grade display: ${gradeDisplay}, Starting chainage: ${startingChainage}\n`;
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
    pointsCAD.forEach((point, index) => {
        script += `${point.x.toFixed(1)},${point.rl.toFixed(1)}\n`;
    });
    script += '\n';
    script += '\n';

    // Add RL markers
    pointsCAD.forEach((point, index) => {
        script += `CIRCLE ${point.x.toFixed(1)},${point.rl.toFixed(1)} 100\n`;
    });
    script += '\n';

    // Calculate vertical offsets for RL labels (stack them when segments are < 1m)
    const labelOffsetsCAD = [];
    const baseOffsetCAD = 500; // Base distance above node in CAD units
    const stackSpacingCAD = 450; // Vertical spacing between stacked labels in CAD units
    let currentStackLevelCAD = 0;

    pointsCAD.forEach((point, index) => {
        if (index === 0) {
            // First point always at base level
            labelOffsetsCAD.push(baseOffsetCAD);
            currentStackLevelCAD = 0;
        } else {
            // Check if previous segment is less than 1m
            const previousSegmentLength = segmentData[index - 1]?.length || 0;
            if (previousSegmentLength < 1) {
                // Stack above previous label
                currentStackLevelCAD++;
            } else {
                // Reset to base level
                currentStackLevelCAD = 0;
            }
            labelOffsetsCAD.push(baseOffsetCAD + (currentStackLevelCAD * stackSpacingCAD));
        }
    });

    // Add RL text labels with jogger lines
    script += 'LAYER S RAMP-TEXT\n';
    pointsCAD.forEach((point, index) => {
        const labelOffset = labelOffsetsCAD[index];

        // Jogger line from node to label (not touching either)
        const joggerStartY = point.rl + 150; // Start 150mm above node
        const joggerEndY = point.rl + labelOffset - 100; // End 100mm below label baseline
        script += `LINE ${point.x.toFixed(1)},${joggerStartY.toFixed(1)} ${point.x.toFixed(1)},${joggerEndY.toFixed(1)}\n`;

        // Convert back to original units for display with specified decimal places (no units)
        const originalRL = point.rl / unitMultiplier;
        const rlText = `RL ${originalRL >= 0 ? '+' : ''}${formatDistance(originalRL, distanceUnits, rlDecimalPlaces)}`;

        // Horizontal RL label, right-justified, positioned above the node
        script += `TEXT\n`;
        script += `J\n`;
        script += `MR\n`; // Middle Right justification
        script += `${(point.x - 125).toFixed(1)},${(point.rl + labelOffset).toFixed(1)}\n`;
        script += `150\n`;
        script += `0\n`; // No rotation - horizontal text
        script += `${rlText}\n`;
        script += `\n`;

        // Use actual chainage with starting chainage offset (rotated 270 degrees for top-to-bottom reading, no units)
        // Use center-aligned text (J MC = Justify Middle Center)
        const formattedChainage = formatDistance(point.chainage, distanceUnits, chainageDecimalPlaces);
        const chainageLabel = chainagePosition === 'suffix' ? `${formattedChainage} ${chainagePrefix}` : `${chainagePrefix}${formattedChainage}`;
        script += `TEXT\n`;
        script += `J\n`;
        script += `MC\n`;
        script += `${point.x.toFixed(1)},${(point.rl - 400).toFixed(1)}\n`;
        script += `120\n`;
        script += `270\n`;
        script += `${chainageLabel}\n`;
        script += `\n`;
    });
    script += '\n';

    // Add start and end labels (positioned above any stacked RL labels)
    const startPoint = pointsCAD[0];
    const endPoint = pointsCAD[pointsCAD.length - 1];
    const maxStackHeightCAD = Math.max(...labelOffsetsCAD);
    const startEndLabelOffsetCAD = maxStackHeightCAD + 400; // Position above any stacked labels

    script += `TEXT ${startPoint.x.toFixed(1)},${(startPoint.rl + startEndLabelOffsetCAD).toFixed(1)} 180 0 ${startLabel}\n`;
    script += `TEXT ${endPoint.x.toFixed(1)},${(endPoint.rl + startEndLabelOffsetCAD).toFixed(1)} 180 0 ${endLabel}\n`;
    script += '\n';

    // Add grade labels with specified decimal places
    segmentsCAD.forEach((segment, index) => {
        const startPoint = pointsCAD[index];
        const endPoint = pointsCAD[index + 1];
        const midX = (startPoint.x + endPoint.x) / 2;
        const midRL = (startPoint.rl + endPoint.rl) / 2;
        
        const gradeText = formatGrade(segment.gradePercent, gradeDisplay, gradeDecimalPlaces);
        script += `TEXT ${midX.toFixed(1)},${(midRL + 150).toFixed(1)} 120 0 ${gradeText}\n`;
    });
    script += '\n';

    // Add horizontal dimension lines with specified decimal places
    script += 'LAYER S RAMP-DIMENSIONS\n';
    const dimY = Math.min(...pointsCAD.map(p => p.rl)) - 1000;
    
    segmentsCAD.forEach((segment, index) => {
        const startX = pointsCAD[index].x;
        const endX = pointsCAD[index + 1].x;
        
        script += `LINE ${startX.toFixed(1)},${dimY.toFixed(1)} ${endX.toFixed(1)},${dimY.toFixed(1)}\n`;
        script += `LINE ${startX.toFixed(1)},${(dimY - 100).toFixed(1)} ${startX.toFixed(1)},${(dimY + 100).toFixed(1)}\n`;
        script += `LINE ${endX.toFixed(1)},${(dimY - 100).toFixed(1)} ${endX.toFixed(1)},${(dimY + 100).toFixed(1)}\n`;
        
        const midX = (startX + endX) / 2;
        // Convert back to original units for display with specified decimal places
        const originalLength = segment.length / unitMultiplier;
        script += `TEXT ${midX.toFixed(1)},${(dimY - 300).toFixed(1)} 120 0 ${formatDistance(originalLength, distanceUnits, chainageDecimalPlaces)}${getDistanceUnit(distanceUnits)}\n`;
    });
    script += '\n';

    // Add datum reference line
    script += 'LAYER S RAMP-REFERENCE\n';
    const datumY = startingRL * unitMultiplier;
    const totalLengthCAD = totalLength * unitMultiplier;
    const lineStart = -totalLengthCAD * 0.1;
    const lineEnd = totalLengthCAD * 1.1;
    script += `LINE ${lineStart.toFixed(1)},${datumY.toFixed(1)} ${lineEnd.toFixed(1)},${datumY.toFixed(1)}\n`;
    script += 'LINETYPE S DASHED\n';
    script += `LINE ${lineStart.toFixed(1)},${datumY.toFixed(1)} ${lineEnd.toFixed(1)},${datumY.toFixed(1)}\n`;
    script += 'LINETYPE S CONTINUOUS\n';
    script += `TEXT ${lineStart.toFixed(1)},${(datumY + 150).toFixed(1)} 120 0 RL ${formatDistance(startingRL, distanceUnits, rlDecimalPlaces)}\n`;
    script += '\n';

    script += 'ZOOM E\n';
    script += 'LAYER S RAMP-PROFILE\n';

    return script;
}

function generatePlanAutoCADScript(segmentData, width, gradeType, chainageDecimalPlaces = 1, gradeDecimalPlaces = 1, distanceUnits = 'm', gradeDisplay = 'percent') {
    const totalLength = segmentData.reduce((sum, seg) => sum + seg.length, 0);
    
    // Convert measurements to AutoCAD units (always use mm for precision)
    const unitMultiplier = 1000; // Always use mm for AutoCAD for precision
    const totalLengthCAD = totalLength * unitMultiplier;
    const widthCAD = width * unitMultiplier;
    const segmentsCAD = segmentData.map(s => ({
        ...s,
        length: s.length * unitMultiplier
    }));

    let script = '; AutoCAD Script File - Ramp Plan View\n';
    script += '; Generated by Multi-Segment Ramp Design Tool\n';
    script += `; Generated: ${new Date().toISOString()}\n`;
    script += '; All measurements in millimeters for precision\n';
    script += `; Original units: ${distanceUnits}, CH decimals: ${chainageDecimalPlaces}, Grade decimals: ${gradeDecimalPlaces}\n`;
    script += `; Grade display: ${gradeDisplay}\n`;
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

    segmentsCAD.forEach((segment, index) => {
        const segmentWidthCAD = segment.length;
        const nextX = currentX + segmentWidthCAD;

        if (segment.gradePercent === 0) {
            script += 'LAYER S RAMP-LANDING\n';
        } else {
            script += 'LAYER S RAMP-OUTLINE\n';
        }

        script += `RECTANG ${currentX.toFixed(1)},${(centerY - widthCAD/2).toFixed(1)} ${nextX.toFixed(1)},${(centerY + widthCAD/2).toFixed(1)}\n`;

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

    // Add longitudinal dimensions with specified decimal places
    script += 'LAYER S RAMP-DIMENSIONS\n';
    const dimY = centerY + widthCAD/2 + 300;
    
    currentX = 0;
    segmentsCAD.forEach((segment, index) => {
        const nextX = currentX + segment.length;
        
        script += `LINE ${currentX.toFixed(1)},${dimY.toFixed(1)} ${nextX.toFixed(1)},${dimY.toFixed(1)}\n`;
        script += `LINE ${currentX.toFixed(1)},${(dimY - 50).toFixed(1)} ${currentX.toFixed(1)},${(dimY + 50).toFixed(1)}\n`;
        script += `LINE ${nextX.toFixed(1)},${(dimY - 50).toFixed(1)} ${nextX.toFixed(1)},${(dimY + 50).toFixed(1)}\n`;
        
        const midX = (currentX + nextX) / 2;
        // Convert back to original units for display with specified decimal places
        const originalLength = segment.length / unitMultiplier;
        const gradeText = formatGrade(segment.gradePercent, gradeDisplay, gradeDecimalPlaces);
        const dimensionText = `${formatDistance(originalLength, distanceUnits, chainageDecimalPlaces)}${getDistanceUnit(distanceUnits)} @ ${gradeText}`;
        
        script += `TEXT ${midX.toFixed(1)},${(dimY + 150).toFixed(1)} 120 0 ${dimensionText}\n`;
        
        currentX = nextX;
    });
    script += '\n';

    // Add width dimension with specified decimal places
    script += 'LAYER S RAMP-DIMENSIONS\n';
    const widthDimX = -400;
    
    script += `LINE ${widthDimX.toFixed(1)},${(centerY - widthCAD/2).toFixed(1)} ${widthDimX.toFixed(1)},${(centerY + widthCAD/2).toFixed(1)}\n`;
    script += `LINE ${(widthDimX - 50).toFixed(1)},${(centerY - widthCAD/2).toFixed(1)} ${(widthDimX + 50).toFixed(1)},${(centerY - widthCAD/2).toFixed(1)}\n`;
    script += `LINE ${(widthDimX - 50).toFixed(1)},${(centerY + widthCAD/2).toFixed(1)} ${(widthDimX + 50).toFixed(1)},${(centerY + widthCAD/2).toFixed(1)}\n`;
    
    script += `TEXT ${(widthDimX + 150).toFixed(1)},${centerY.toFixed(1)} 120 0 ${formatDistance(width, distanceUnits, chainageDecimalPlaces)}${getDistanceUnit(distanceUnits)}\n`;
    script += '\n';

    // Add title
    script += 'LAYER S RAMP-TEXT\n';
    script += `TEXT ${(totalLengthCAD/2).toFixed(1)},${(centerY + widthCAD/2 + 800).toFixed(1)} 200 0 RAMP PLAN VIEW\n`;
    script += `TEXT ${(totalLengthCAD/2).toFixed(1)},${(centerY + widthCAD/2 + 1100).toFixed(1)} 150 0 Total Length: ${formatDistance(totalLength, distanceUnits, chainageDecimalPlaces)}${getDistanceUnit(distanceUnits)}\n`;
    script += '\n';

    script += 'ZOOM E\n';
    script += 'LAYER S RAMP-OUTLINE\n';

    return script;
}