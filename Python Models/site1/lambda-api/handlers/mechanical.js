// Native Lambda handler for mechanical simulation
import mechanicalHandler from '../../api/mechanical.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

export const main = wrapSimulationHandler(mechanicalHandler);
