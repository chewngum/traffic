// Native Lambda handler for boomgate simulation
import boomgateHandler from '../../api/boomgate.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

export const main = wrapSimulationHandler(boomgateHandler);
