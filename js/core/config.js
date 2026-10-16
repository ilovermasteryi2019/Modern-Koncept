/* =============================================================================
 * K-Desk | js/core/config.js
 * Global configuration
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : API_URL is the address of the Node/Express backend. Every request in the other files is built from it,
 * so if the backend moves, this is the ONLY line you change.
 * DEPENDS ON   : Nothing.
 * LOAD ORDER   : file 2 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * API_URL
 * ============================================================================= */

const API_URL = 'https://modern-koncept.onrender.com';
