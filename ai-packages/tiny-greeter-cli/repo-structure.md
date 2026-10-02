[
  {
    "path": "package.json",
    "purpose": "Declares package metadata, bin entry point ('greet' -> './index.js'), engines field (node >=18), and no dependencies."
  },
  {
    "path": "index.js",
    "purpose": "CLI entry point. Reads process.argv for optional name, imports getFormattedTime from lib/time.js, constructs and prints the greeting to stdout."
  },
  {
    "path": "lib/time.js",
    "purpose": "Utility module exporting getFormattedTime(). Uses built-in Date to return a formatted time string (HH:MM:SS)."
  },
  {
    "path": "README.md",
    "purpose": "Usage instructions: how to run with node, how to install globally via npm link, and example output."
  }
]