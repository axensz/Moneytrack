## ADDED Requirements

### Requirement: Patched direct dependency floors
The dependency manifest MUST prevent reinstalling the direct vulnerable versions identified in the August 2026 baseline.

#### Scenario: Resolve framework and build dependencies
- **WHEN** npm resolves the manifest and lockfile
- **THEN** `next` and `eslint-config-next` resolve to at least `16.2.12`
- **THEN** `postcss` resolves to at least `8.5.25`
- **THEN** `sharp` resolves to at least `0.35.3`

### Requirement: Patched transitive dependency lines
Every installed major line implicated by the current advisories MUST resolve to a non-vulnerable version without adding a replacement library.

#### Scenario: Resolve vulnerable transitive packages
- **WHEN** `npm ci` installs from the committed lockfile
- **THEN** protobufjs resolves to at least `7.6.5`
- **THEN** js-yaml resolves to at least `4.3.1`
- **THEN** brace-expansion 1.x, 2.x, and 5.x resolve to at least `1.1.18`, `2.1.4`, and `5.0.9` respectively

#### Scenario: Next.js still constrains sharp to 0.34.x
- **WHEN** the stable Next.js package does not admit patched sharp through its optional semver range
- **THEN** npm uses the explicit sharp override
- **THEN** the static build remains successful with unoptimized images

### Requirement: Zero known npm vulnerabilities
The committed production and development dependency tree MUST report zero known vulnerabilities at implementation time.

#### Scenario: Run the security audit
- **WHEN** `npm audit` runs after a clean `npm ci`
- **THEN** its exit code is zero
- **THEN** it reports zero critical, high, moderate, low, and total vulnerabilities

#### Scenario: GitHub rescans the default branch
- **WHEN** the secure lockfile reaches the default branch and Dependabot completes its scan
- **THEN** the 17 baseline alerts are closed by dependency updates
- **THEN** no alert is dismissed merely as not applicable

### Requirement: Static deployment architecture remains unchanged
Security remediation MUST NOT enable a Next.js server feature that the GitHub Pages deployment cannot provide.

#### Scenario: Build the application
- **WHEN** the updated tree runs the production build
- **THEN** Next.js completes `output: 'export'`
- **THEN** images remain configured as unoptimized
- **THEN** no middleware, proxy, Server Action, rewrite, custom server, or Image Optimization API is introduced

### Requirement: Dependency update remains focused and reproducible
Within the root frontend manifest and dependency tree, the remediation MUST change only direct security floors, required overrides, transitive lock resolutions needed for a secure tree, and the official rules-emulator test dependency.

#### Scenario: Install from the lockfile
- **WHEN** CI runs `npm ci` on Node.js 22
- **THEN** installation succeeds without modifying `package-lock.json`
- **THEN** typecheck, lint, tests, and build use the same resolved versions

#### Scenario: Review manifest scope
- **WHEN** the root frontend dependency diff is reviewed
- **THEN** no new root runtime package or unrelated major upgrade is present
- **THEN** `@firebase/rules-unit-testing` `^5.0.1` is the only new development package in the root frontend manifest
