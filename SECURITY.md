# Security policy

## Supported version

Security fixes are applied to the latest version on the default branch. This project is pre-1.0, so users should update to the newest commit before building.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or accidentally exposed secret. Use GitHub's private vulnerability reporting feature for this repository. Include the affected commit, reproduction steps, expected impact, and any suggested mitigation.

Do not include real media, transcripts, credentials, signing certificates, access tokens, or personal file paths in a report. Use synthetic fixtures and redact local paths.

## Security boundaries

- LocalScribe does not require accounts, API keys, telemetry, or cloud transcription.
- Runtime and model downloads are restricted to HTTPS hosts declared in source and verified against pinned sizes and cryptographic checksums.
- ZIP extraction rejects links, special files, unsafe paths, duplicate required entries, and oversized archives; it extracts only files required by the runtime manifest.
- The renderer is sandboxed and has no Node.js integration. Privileged operations cross a narrow, validated IPC bridge.
- Transcript history is stored in a user-only local SQLite file. It stores the source file name and transcript metadata/text, but not the source media path or media payload. It is not application-level encrypted, so operating-system account and disk-encryption protections remain important.
- A locally writable user profile is not treated as a security boundary. Anyone who can modify another user's LocalScribe data or executable files may already act with that user's operating-system permissions.

## Release integrity

Source builds are suitable for local use. Public binary releases should be produced from a reviewed commit in a clean CI environment and signed/notarized with the platform's official distribution mechanism. Never commit signing identities or passwords.
