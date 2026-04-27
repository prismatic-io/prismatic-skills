# Network Configuration for Prismatic Access

For Claude to use Prism CLI and deploy integrations, network access to Prismatic's domains must be enabled.

## Required Configuration

**For Team and Enterprise Plans:**

1. Open Claude Settings
2. Navigate to: **Admin settings → Capabilities**
3. Find: **Network access** settings
4. Select: **"Allow network egress to package managers and specific domains"**
5. Add domain: `*.prismatic.io`
6. Save changes

## Domains Used

Prism CLI and this skill need access to:

- `app.prismatic.io` - Primary API endpoint (US commercial region)
- `*.prismatic.io` - For regional endpoints and subdomains

**Note:** If your organization uses a regional or private cloud deployment, you may need additional domains. See: <https://prismatic.io/docs/configure-prismatic/deployment-regions/>

---

## Verification

Once configured, the skill will automatically test connectivity. You can also verify manually:

```bash
# This should succeed if properly configured
prism me
```

If you see network errors, the configuration may not be applied yet. Wait a moment and try again.

---

## Individual/Pro Plans

Network configuration is only available on Team and Enterprise plans. Individual and Pro plan users cannot modify network settings.

**Workaround:** Generate code only (deployment must be done manually on your computer)

---

## Official Documentation

- **Claude Network Settings**: <https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude>
- **Prismatic Regions**: <https://prismatic.io/docs/configure-prismatic/deployment-regions/>

---

## Troubleshooting

### "Cannot reach app.prismatic.io"

**Cause:** Domain not in allowlist

**Solution:** Follow configuration steps above

### "Connection timeout"

**Cause:** Network policy or firewall blocking

**Solution:** Contact your IT administrator about allowing \*.prismatic.io
