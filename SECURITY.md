# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ Active |
| < 1.0.0 | ❌ No longer supported |

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub Issues.**

If you discover a security vulnerability in X-Now, please report it responsibly:

1. **Contact**: Reach out via DM on X (Twitter) or GitHub to [@benedictusrey](https://github.com/benedictusrey)
2. **Subject line**: `X-Now Security Disclosure`
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

You will receive an acknowledgement within **48 hours**, and a fix timeline within **7 days** for critical issues.

## Scope

The following are **in scope** for security reports:
- Remote code execution via WebView2 sandbox escape
- OAuth token leakage or interception
- Privilege escalation via the Tauri IPC layer
- Local file system access beyond the intended app data directory

The following are **out of scope**:
- Security issues in X (Twitter) itself — report those to X Corp.
- Issues requiring physical access to the device
- Social engineering attacks

## Disclosure Policy

We follow responsible disclosure: fixes will be released before public details are shared. Credit will be given to reporters who follow this process.

---

> X-Now is an independent project. Not affiliated with X Corp. or Twitter, Inc.
