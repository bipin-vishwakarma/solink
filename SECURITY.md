# Security policy

## Reporting a vulnerability

Please use
[GitHub Private Vulnerability Reporting](https://github.com/bipin-vishwakarma/solink/security/advisories/new).
Do not disclose vulnerabilities, credentials, private messages, user
identifiers, database contents, or key backups in a public issue.

Include a minimal reproduction, affected component, impact, and suggested
mitigation if known. Remove all real user data from screenshots and logs.

## Supported version

Security fixes target the latest production version on `main`. Older commits,
forks, previews, and self-hosted deployments may not receive fixes.

## Security model

Solink encrypts message and attachment content in the browser before transport.
Supabase stores ciphertext but still observes metadata such as accounts,
conversation membership, timestamps, object sizes, and delivery activity.

This project is not an audited replacement for Signal or WhatsApp. It currently
uses long-lived ECDH identity keys and does not provide a Double Ratchet,
forward secrecy, post-compromise security, or automatic peer safety-number
verification. Device compromise, malicious browser extensions, injected
JavaScript, compromised OAuth accounts, and endpoint screenshots remain outside
the protection offered by message encryption.

See [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md) for the detailed threat
model and trust boundaries.
