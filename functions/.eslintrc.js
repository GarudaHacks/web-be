module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2018,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "valid-jsdoc": "off",
    "max-len": "off",
    "new-cap": "off",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
    "linebreak-style": ["error", process.platform === "win32" ? "windows" : "unix"],
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
