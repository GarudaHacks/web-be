module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    indent: ["error", 2],
    quotes: ["error", "double", { allowTemplateLiterals: true }],
    "import/no-unresolved": 0,
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "valid-jsdoc": "off",
    "max-len": "off",
    "new-cap": "off",
    "linebreak-style": [
      "error",
      process.platform === "win32" ? "windows" : "unix",
    ],
    "@typescript-eslint/no-explicit-any": "off",
  },
};
