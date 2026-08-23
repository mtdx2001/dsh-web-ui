# Workbench stage30 trusted publish

This orphan branch contains only the three audited npm tarballs and the one-time GitHub Actions OIDC publishing workflow for Workbench stage30.

The workflow verifies each tarball SHA-256 before publishing, then publishes in dependency order:

1. `@mtdx2001/dsh-client-ui-workbench@0.1.19`
2. `@mtdx2001/dsh-client-ui-balance-rows@0.1.19`
3. `@mtdx2001/dsh-workbench-suite@0.1.19`

No npm token or repository secret is used. npm authorizes the workflow through Trusted Publishing and records provenance.
