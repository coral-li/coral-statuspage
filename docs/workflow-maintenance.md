# Workflow maintenance

The workflows are maintained in this repository, based on Upptime 1.46.3.
Monitoring, graphs, summaries, site publishing and setup retain their existing
schedules and dispatch events. Node steps use the patched LTS in `.nvmrc`.

Upptime 1.46.3 hard-codes Node 20 and older action versions in its workflow
generator, with no configuration override. The automatic template updater and
the template-generation step in Setup CI have therefore been removed: running
`update-template` would overwrite these security fixes. Do not run that command
against this repository without reviewing the generated diff.

Dependabot proposes GitHub Actions updates for review. Pin external Actions to full commit SHAs and keep the verified version tags
in trailing comments. When adopting new Upptime releases, compare
upstream `src/helpers/workflows.ts`, apply relevant template changes manually,
and run the workflow checks before merging. Changes to monitored sites still
belong in `.upptimerc.yml`; Setup CI still updates response times, README, graphs
and the site when that configuration changes.

The legacy `upptime/updates` action was also removed: its latest release uses
Node 12 and its implementation only validates token presence and prints OK.
It does not fetch or install security updates. Dependabot now tracks actual
workflow dependencies.

## Configuration changes

Workflow generation is no longer automatic. When editing `.upptimerc.yml`,
review its workflow-derived settings together with the YAML:

- Add/remove secret references in `SECRETS_CONTEXT` in uptime, response-time
  and setup workflows when changing `secrets` or monitored-site credentials.
  Narrowing the config allowlist alone does not remove existing workflow access.
- Apply `workflowSchedule` changes to the corresponding `on.schedule` entries,
  and apply `runner` changes to `runs-on`.
- IPv6 sites may need WARP setup; follow the current upstream template for that
  configuration before enabling the site.
- When removing or renaming a site, review and remove its obsolete slug under
  `api/`, `history/` and `graphs/` after deciding what historical data to retain.

The site's display configuration is still read at runtime; these manual steps
cover settings that Upptime previously embedded in generated workflow files.

## Graph renderer

Graph tooling is locked locally. Canvas 3 provides Node 24-compatible native
binaries while retaining Upptime's Chart.js 2 charts. CI renders five PNGs from
synthetic history in a fresh directory; it does not contact GitHub or publish.
The graph workflows install the lockfile, run this check, then render real
history and optimize PNGs with Sharp before committing. Rendering, optimization
and push failures fail the job. A local bare-repository test also checks
commit authorship, signoff and publishing without contacting GitHub. This replaces Upptime's unchecked `npx` calls
and the obsolete imagemin binary-download dependency chain.
