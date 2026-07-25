/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Warn about circular dependencies in backend codebase',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Find files that are not referenced by any other file',
      from: {
        orphan: true,
        pathNot: ['^src/main\\.ts$', '^src/app\\.module\\.ts$'],
      },
      to: {},
    },
    {
      name: 'no-deprecated-core',
      severity: 'warn',
      comment: 'Warn about usage of deprecated node core modules',
      from: {},
      to: {
        dependencyTypes: ['core'],
        path: ['^punycode$', '^domain$', '^constants$', '^sys$'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
