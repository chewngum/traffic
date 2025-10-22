// Native Lambda handler for contact form
import sendformHandler from '../../api/sendform.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

// Sendform handler uses same pattern as simulations (authenticated POST endpoint)
export const main = wrapSimulationHandler(sendformHandler);
