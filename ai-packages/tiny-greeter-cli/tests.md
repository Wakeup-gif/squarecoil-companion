[
  "node index.js  # stdout must match: Hello, World! The current time is HH:MM:SS.",
  "node index.js Alice  # stdout must match: Hello, Alice! The current time is HH:MM:SS.",
  "node index.js  # exit code must be 0",
  "node index.js Alice  # exit code must be 0",
  "node test/time.test.js  # all 6 test cases must pass with exit code 0",
  "npm test  # must invoke node test/time.test.js and exit 0",
  "getFormattedTime() return value must match regex /^\\d{2}:\\d{2}:\\d{2}$/",
  "getFormattedTime() must return typeof 'string'",
  "getFormattedTime() return value must have length 8",
  "Hours component of getFormattedTime() must be integer in range [0, 23]",
  "Minutes component of getFormattedTime() must be integer in range [0, 59]",
  "Seconds component of getFormattedTime() must be integer in range [0, 59]",
  "package.json must be valid JSON parseable by JSON.parse()",
  "package.json bin.greet must equal './index.js'",
  "package.json engines.node must equal '>=18'",
  "index.js line 1 must equal '#!/usr/bin/env node'"
]