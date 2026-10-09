"use strict";

require('../src/store').initialize().then(() => console.log('SafeTap schema and initial administrator are ready.')).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
