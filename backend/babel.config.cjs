module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
  ],
  plugins: [
    // The package is "type": "module" and runs as real ESM, but Jest transforms
    // it to CJS, where `import.meta` is a parse error rather than a runtime
    // one: any file containing it fails to load at all, taking its whole suite
    // with it. `utils/uploadsPath.js` and `utils/seedBranches.js` both need
    // `import.meta.url` to resolve paths relative to themselves rather than to
    // `process.cwd()`. This plugin rewrites it for the CJS build only; the
    // production ESM path is untouched.
    'babel-plugin-transform-import-meta',
  ],
};
