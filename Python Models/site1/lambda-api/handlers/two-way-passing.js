// Native Lambda handler for two-way-passing simulation
import twoWayPassingHandler from '../../api/two-way-passing.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

export const main = wrapSimulationHandler(twoWayPassingHandler);
