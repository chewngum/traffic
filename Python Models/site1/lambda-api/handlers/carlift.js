// Native Lambda handler for carlift simulation
import carliftHandler from '../../api/carlift.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

export const main = wrapSimulationHandler(carliftHandler);
