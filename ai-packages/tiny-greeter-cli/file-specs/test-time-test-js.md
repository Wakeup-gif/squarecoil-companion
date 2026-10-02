{
  "dependencies": [
    "Built-in `node:test` module.",
    "Built-in `node:assert` module.",
    "`../lib/time.js` via `require`."
  ],
  "do_not_change": [
    "Do not import any external test framework (no Jest, Mocha, etc.).",
    "Do not mock the `Date` object — test the real output format only, not a specific time value."
  ],
  "edge_cases": [
    "Tests must pass regardless of the time of day they are run.",
    "Tests must not depend on system locale or timezone for format validation."
  ],
  "implementation_notes": [
    "Use `import { test } from 'node:test'` — wait, the project uses CommonJS, so use `const { test } = require('node:test')` and `const assert = require('node:assert')`.",
    "Write at least 4 test cases covering: return type is string, format matches regex, length is exactly 8 characters, and components are in valid numeric ranges.",
    "Use `assert.strictEqual` for type and length checks.",
    "Use `assert.match` for regex format check.",
    "Parse the returned string by splitting on `:` to validate each numeric component range.",
    "File is runnable directly: `node test/time.test.js`."
  ],
  "interfaces": [
    "No exports. Test runner file only."
  ],
  "path": "test/time.test.js",
  "purpose": "Unit tests for `lib/time.js` using the Node.js built-in `node:test` runner and `node:assert`. Validates that `getFormattedTime()` returns a correctly formatted 24-hour time string under all conditions.",
  "tests": [
    "Test 1: `typeof getFormattedTime()` strictly equals `'string'`.",
    "Test 2: return value matches regex `/^\\d{2}:\\d{2}:\\d{2}$/`.",
    "Test 3: return value has length exactly 8.",
    "Test 4: hours component (split[0]) parsed as integer is between 0 and 23.",
    "Test 5: minutes component (split[1]) parsed as integer is between 0 and 59.",
    "Test 6: seconds component (split[2]) parsed as integer is between 0 and 59."
  ]
}