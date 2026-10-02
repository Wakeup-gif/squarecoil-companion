{
  "dependencies": [
    "Built-in `Date` object (global, no import needed)."
  ],
  "do_not_change": [
    "Do not import any external module.",
    "Do not use `Intl.DateTimeFormat` or any locale-aware API — keep formatting manual with `Date` prototype methods.",
    "Do not add side effects at module load time (no console output, no file I/O)."
  ],
  "edge_cases": [
    "Hours, minutes, and seconds must each be zero-padded to exactly 2 digits (e.g., `09` not `9`).",
    "The function must always return a string; it must never throw under normal conditions.",
    "Midnight must render as `00:00:00`, not `24:00:00`."
  ],
  "implementation_notes": [
    "Use CommonJS `module.exports`.",
    "Export a single function: `getFormattedTime()`.",
    "Inside the function, instantiate `new Date()` to capture the current local time.",
    "Extract hours via `date.getHours()`, minutes via `date.getMinutes()`, seconds via `date.getSeconds()`.",
    "Zero-pad each component using `String(value).padStart(2, '0')`.",
    "Return the concatenated string in the format `HH:MM:SS`.",
    "No parameters are accepted by this function."
  ],
  "interfaces": [
    "module.exports = { getFormattedTime }",
    "getFormattedTime() -> string  // returns current local time as 'HH:MM:SS'"
  ],
  "path": "lib/time.js",
  "purpose": "Utility module that exports `getFormattedTime()`. Uses the built-in `Date` object to return the current local time formatted as a zero-padded 24-hour `HH:MM:SS` string.",
  "tests": [
    "Return value matches the regex `/^\\d{2}:\\d{2}:\\d{2}$/`.",
    "Return value is a string (typeof === 'string').",
    "Hours component is between 00 and 23 inclusive.",
    "Minutes component is between 00 and 59 inclusive.",
    "Seconds component is between 00 and 59 inclusive.",
    "Calling the function twice in rapid succession returns strings of identical length and format."
  ]
}