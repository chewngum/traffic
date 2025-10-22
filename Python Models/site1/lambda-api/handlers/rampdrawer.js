// Native Lambda handler for rampdrawer simulation
import rampdrawerHandler from '../../api/rampdrawer.js';
import { wrapSimulationHandler } from '../lib/simulation-wrapper.js';

export const main = wrapSimulationHandler(rampdrawerHandler);
