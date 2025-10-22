// Native Lambda handler for carparkutilisation simulation
import carparkutilisationHandler from '../../api/carparkutilisation.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

export const main = wrapSimulationHandler(carparkutilisationHandler);
