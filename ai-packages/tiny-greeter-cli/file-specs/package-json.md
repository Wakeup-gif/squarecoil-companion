{
  "dependencies": [],
  "do_not_change": [
    "Do not add any `dependencies` or `devDependencies` fields with external packages.",
    "Do not change the `bin` field key name `greet` or its value `./index.js`.",
    "Do not set `\"type\": \"module\"` — the project uses CommonJS `require`.",
    "Do not add a `scripts.build` entry or any transpilation step."
  ],
  "edge_cases": [
    "If Node.js version is below 18, the `engines` field will cause `npm install` to warn but will not block `node index.js` execution — this is acceptable.",
    "The `main` field is optional for a CLI-only tool; omit it to keep the file minimal."
  ],
  "implementation_notes": [
    "Set `\"name\": \"greet-cli\"`.",
    "Set `\"version\": \"1.0.0\"`.",
    "Set `\"description\": \"A minimal CLI that prints a greeting with the current time.\"`.",
    "Set `\"bin\": { \"greet\": \"./index.js\" }`.",
    "Set `\"engines\": { \"node\": \">=18\" }`.",
    "Set `\"license\": \"MIT\"`.",
    "Do NOT include a `dependencies` or `devDependencies` field.",
    "Include `\"scripts\": { \"test\": \"node test/time.test.js\" }` to allow `npm test`."
  ],
  "interfaces": [
    "No exports. This is a configuration file only."
  ],
  "path": "package.json",
  "purpose": "Declares package metadata, the `greet` bin entry pointing to `./index.js`, the Node.js engine requirement, and the test script. Enables optional global install via `npm link`.",
  "tests": [
    "Validate JSON is well-formed.",
    "Confirm `bin.greet` equals `./index.js`.",
    "Confirm `engines.node` equals `>=18`.",
    "Confirm no `dependencies` key exists at the top level."
  ]
}