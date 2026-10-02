{
  "dependencies": [],
  "do_not_change": [
    "Do not include any credentials, tokens, or deployment-specific URLs.",
    "Do not document features that are not implemented (e.g., flags, options, config files)."
  ],
  "edge_cases": [
    "Note the Windows caveat: shebang line is ignored on Windows; users must invoke `node index.js` directly."
  ],
  "implementation_notes": [
    "Include a `## Usage` section with two examples: `node index.js` and `node index.js <name>`.",
    "Include a `## Example Output` section showing sample output lines.",
    "Include a `## Global Install` section explaining `npm link` and then `greet [name]`.",
    "Include a `## Requirements` section stating Node.js 18+.",
    "Include a `## Testing` section showing `node test/time.test.js` or `npm test`.",
    "Keep the document concise — no more than 60 lines."
  ],
  "interfaces": [
    "No exports. Documentation file only."
  ],
  "path": "README.md",
  "purpose": "Usage documentation for the greeting CLI. Covers direct invocation, optional name argument, example output, global install via `npm link`, requirements, and how to run tests.",
  "tests": [
    "Not applicable — documentation file. Verify manually that all code examples match the actual implementation."
  ]
}