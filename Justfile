# Run unit tests.
test:
    node --test

# Lint the codebase.
lint:
    npx eslint .

# Build all brand assets.
build:
    node scripts/build.js

# Verify committed assets are up to date.
build-check:
    node scripts/build.js --check
