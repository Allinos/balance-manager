/**
 * Replaces the desktop's services/api.js inside DocGen Mobile (see vite.config.js): the desktop services call
 * `call(command, args)` and get the same answers from the on-phone engine that the Rust backend gives on a computer.
 */

export { call } from './commands.js';

export const isTauri = () => false;
