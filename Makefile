.PHONY: help install build dev typecheck test run run-headless pack-dry publish-npm clean

help:
	@printf '%s\n' 'install        Install dependencies' 'build          Compile TypeScript and mark CLI executable' 'dev            Run from TypeScript source' 'typecheck      Check strict TypeScript types' 'test           Run unit tests' 'run            Launch the interactive TUI' 'run-headless   Print a diagnostic summary' 'pack-dry       Inspect the npm package contents' 'publish-npm    Publish the package to npm' 'clean          Remove generated build output'

install:
	npm install

build:
	npm run build

dev:
	npm run dev

typecheck:
	npm run typecheck

test:
	npm test

run: build
	node dist/cli.js

run-headless: build
	node dist/cli.js --no-tui

pack-dry: build
	npm pack --dry-run

publish-npm: build
	npm publish --access public

clean:
	npm run clean
