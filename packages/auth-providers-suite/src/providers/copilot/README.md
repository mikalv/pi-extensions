# Copilot provider notes

## Auth policy

For Pi, Copilot should be treated as **native-pi-first**.

Likely split:
- auth/account overlay belongs in `auth-providers-suite`
- org/seat usage reporting can live in a separate usage extension

Current harvested value:
- built-in provider-owned OAuth wrapping pattern
- Copilot-specific auth-to-runtime conversion
- available-model filtering
- enterprise/proxy endpoint derivation
