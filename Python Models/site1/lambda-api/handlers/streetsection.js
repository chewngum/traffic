// Native Lambda handler for streetsection tool
import streetsectionHandler from '../../api/streetsection.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

export const main = wrapSimulationHandler(streetsectionHandler);
