'use strict';

// Render supplies its deployed commit automatically. Other hosts can set
// SAFETAP_COMMIT during deployment; no credentials or DB settings are exposed.
module.exports = {
  version: '1.1.0',
  build: 'v26-photo',
  commit: process.env.RENDER_GIT_COMMIT || process.env.SAFETAP_COMMIT || null
};
