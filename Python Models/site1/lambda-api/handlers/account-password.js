// Native Lambda handler for password change
import passwordHandler from '../../api/account/password.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

// Password handler uses same pattern as simulations (authenticated POST endpoint)
export const main = wrapSimulationHandler(passwordHandler);
