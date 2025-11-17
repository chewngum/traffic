// Native Lambda handler for contact form
import sendformHandler from '../../api/sendform.js';
import { wrapPublicHandler } from '../lib/simulation-wrapper.js';

// Sendform handler is public - no authentication required
export const main = wrapPublicHandler(sendformHandler);
