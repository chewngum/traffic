// Native Lambda handler for account operations
import accountHandler from '../../api/account.js';
import { wrapAccountHandler } from '../lib/simulation-wrapper.js';

// Account handler supports GET, PUT methods (not just POST like simulations)
export const main = wrapAccountHandler(accountHandler);
