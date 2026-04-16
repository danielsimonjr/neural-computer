# NC Dependency Graph Generator

Scans the Neural Computer codebase and generates comprehensive dependency documentation.

Cloned from `memoryjs/tools/create-dependency-graph` with added `.tsx` file support for React components.

## Usage

```bash
# From the neural-computer repo root:
npm run docs:deps

# Or run directly with tsx:
npx tsx tools/create-dependency-graph/create-dependency-graph.ts

# Include test file coverage analysis:
npx tsx tools/create-dependency-graph/create-dependency-graph.ts --include-tests
```

## Output

| File | Purpose |
|------|---------|
| `docs/architecture/DEPENDENCY_GRAPH.md` | Human-readable Markdown documentation |
| `docs/architecture/dependency-graph.json` | Full machine-readable JSON |
| `docs/architecture/dependency-graph.yaml` | Compact YAML (~40% smaller than JSON) |
| `docs/architecture/dependency-summary.compact.json` | Minified summary for LLM consumption |
| `docs/architecture/unused-analysis.md` | Potentially unused files and exports |
| `docs/architecture/TEST_COVERAGE.md` | Test coverage analysis (with `--include-tests`) |
| `docs/architecture/test-coverage.json` | Test coverage JSON (with `--include-tests`) |

## Changes from memoryjs version

- `.tsx` files discovered alongside `.ts` in source and test scans
- `.test.tsx` / `.spec.tsx` recognized as test files
- `resolvePath` tries `.tsx` when `.ts` resolution fails (filesystem check)
- `stripTsExt` helper handles both `.ts` and `.tsx` for display names
- Removed `@yao-pkg/pkg` build target (not needed for NC)
