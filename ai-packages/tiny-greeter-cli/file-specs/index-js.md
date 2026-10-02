{
  "dependencies": [
    "Built-in `process` global (no import needed).",
    "`lib/time.js` via `require('./lib/time')`."
  ],
  "do_not_change": [
    "Do not remove the shebang line `#!/usr/bin/env node` from line 1.",
    "Do not use `process.exit()` explicitly — allow natural process termination with implicit exit code 0.",
    "Do not write to `process.stderr` during normal operation.",
    "Do not accept more than one positional argument (only `process.argv[2]` is used)."
  ],
  "edge_cases": [
    "If `process.argv[2]` is `undefined`, `null`, or an empty string, default to `'World'`.",
    "If `process.argv[2]` is provided but is only whitespace, still use it as-is (no trimming required per spec).",
    "Extra arguments beyond `process.argv[2]` are silently ignored.",
    "The greeting string must end with a period followed by a newline (use `console.log` which appends `\\n`)."
  ],
  "implementation_notes": [
    "First line must be exactly `#!/usr/bin/env node` with no trailing spaces.",
    "File must use Unix line endings (LF, `\\n`), not CRLF.",
    "Use `require('./lib/time')` to import `getFormattedTime`.",
    "Read the name from `process.argv[2]`; if falsy, assign the string `'World'`.",
    "Construct the greeting: `Hello, ${name}! The current time is ${getFormattedTime()}.`",
    "Write the greeting to stdout using `console.log(greeting)`.",
    "No other logic is needed; keep the file under 15 lines of code."
  ],
  "interfaces": [
    "No exports. This is the CLI entry point only.",
    "Stdin: not read.",
    "Stdout: one line — the greeting string.",
    "Stderr: nothing during normal operation.",
    "Exit code: 0 (implicit)."
  ],
  "path": "index.js",
  "purpose": "CLI entry point. Reads an optional name from `process.argv[2]` (defaulting to `'World'`), calls `getFormattedTime()` from `lib/time.js`, constructs the greeting string, and writes it to stdout via `console.log`.",
  "tests": [
    "Running `node index.js` outputs a line matching `/^Hello, World! The current time is \\d{2}:\\d{2}:\\d{2}\\.$/`.",
    "Running `node index.js Alice` outputs a line matching `/^Hello, Alice! The current time is \\d{2}:\\d{2}:\\d{2}\\.$/`.",
    "Running `node index.js` exits with code 0.",
    "Running `node index.js Alice` exits with code 0.",
    "Output contains exactly one newline (one line total)."
  ]
}