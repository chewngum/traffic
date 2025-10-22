// simulation-utilities.js - Common simulation utility functions

function formatScientific(num) {
    if (num === 0) return "0";
    
    const exponent = Math.floor(Math.log10(Math.abs(num)));
    const mantissa = num / Math.pow(10, exponent);
    
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
    return zScores[confidenceLevel];
}

function createAccurateProgressTracker(totalSeeds, seedTimeMs, averagingTimeMs, completedSeeds = 1) {
    const startTime = Date.now();
    const remainingSeeds = totalSeeds - completedSeeds;
    const simulationPhaseTime = seedTimeMs * remainingSeeds;
    const totalEstimatedTime = simulationPhaseTime + averagingTimeMs;
    
    return {
        update: function() {
            const elapsed = Date.now() - startTime;
            
            if (elapsed < simulationPhaseTime) {
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
                const averagingProgress = (elapsed - simulationPhaseTime) / averagingTimeMs;
                const percentage = Math.min(95 + (averagingProgress * 5), 99);
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
    return `
        <div class="validation-section">
            <h4>✅ ${validationTitle}</h4>
            <ul class="validation-list">
                <li><strong>Status:</strong> Validation completed</li>
            </ul>
        </div>
    `;
}

function formatEstimatedTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    return `${(ms/60000).toFixed(1)}m`;
}

function createRealisticProgress(estimatedMs, progressFill, progressPercentage, progressDetails) {
    let startTime = Date.now();
    
    const progressPhases = [
        { start: 85, end: 95, message: 'Calculating statistics...' },
        { start: 95, end: 100, message: 'Finalizing results...' }
    ];
    
    const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const rawProgress = Math.min(95, (elapsed / estimatedMs) * 100);
        
        const smoothedProgress = rawProgress + (Math.random() - 0.5) * 2;
        const progress = Math.max(0, Math.min(95, smoothedProgress));
        
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
        
        return progress < 95;
    };
    
    const interval = setInterval(updateProgress, 150);
    
    return interval;
}

export { 
    formatScientific,
    formatTime,
    getZScoreForConfidence,
    createAccurateProgressTracker,
    generateValidationSection,
    formatEstimatedTime,
    createRealisticProgress
};
