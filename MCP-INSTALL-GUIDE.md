# MCP Server Installation Guide for Claude Desktop + Claude Code

> Install these 3 MCP servers so they're available across ALL your Claude chats, Cowork, and Code sessions.

---

## 1. Google Stitch (UI Design Generation)

Stitch generates UI designs from text prompts. Claude fetches the design and turns it into working code.

### Quick Install
```bash
npx @_davideast/stitch-mcp init
```
This wizard handles auth, Google Cloud config, and MCP client setup automatically.

### Manual Config (Claude Desktop)
Open Claude Desktop > Settings > Developer > Edit Config, add:
```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["@_davideast/stitch-mcp", "proxy"]
    }
  }
}
```

### Authentication Options
- **API Key (easiest):** Set `STITCH_API_KEY` env var — get it from https://stitch.withgoogle.com
- **OAuth:** The `init` command sets this up automatically
- **Existing gcloud:** Set `STITCH_USE_SYSTEM_GCLOUD=1`

### Requirements
- Google Cloud project with billing enabled
- "Stitch API" service enabled in your project
- Owner or Editor role permissions

---

## 2. Nano Banana 2 (AI Image Generation)

Generates images using Google Gemini's image model. Creates illustrations, icons, visual assets.

### Quick Install (Claude Code)
```bash
claude plugin add nano-banana-2-mcp
```

### Manual Config (Claude Desktop)
Open Claude Desktop > Settings > Developer > Edit Config, add:
```json
{
  "mcpServers": {
    "nano-banana-2": {
      "command": "npx",
      "args": ["-y", "nano-banana-2-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-gemini-api-key-here"
      }
    }
  }
}
```

### Get Your Gemini API Key
1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Select your Google Cloud project (or create one)
4. Copy the key and paste it in the config above

### Available Tools
- `generate_image` — Create images from text (1K/2K/4K, various aspect ratios)
- `edit_image` — Modify existing images
- `continue_editing` — Resume editing last generated image
- `get_configuration_status` — Verify setup

### Note
Image generation requires a **paid tier** Gemini API key. The free tier only covers text models.

---

## 3. 21st.dev Magic (React Component Builder)

Already installed! Generates production-ready React components from descriptions.

### Current Config (verify it matches)
```json
{
  "mcpServers": {
    "@21st-dev/magic": {
      "command": "npx",
      "args": ["-y", "@21st-dev/magic@latest"],
      "env": {
        "API_KEY": "your-21st-dev-api-key"
      }
    }
  }
}
```

### Get/Verify Your API Key
1. Go to https://21st.dev/magic/console
2. Generate or copy your API key
3. Make sure it's in your config

---

## Where to Edit the Config File

### Claude Desktop (macOS)
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Claude Desktop (Windows)
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Claude Code
```bash
claude mcp list              # See current servers
claude mcp add <name>        # Add a server
```
Or edit `~/.claude/settings.json`

---

## Complete Config Example (All 3 Servers)

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["@_davideast/stitch-mcp", "proxy"]
    },
    "nano-banana-2": {
      "command": "npx",
      "args": ["-y", "nano-banana-2-mcp"],
      "env": {
        "GEMINI_API_KEY": "YOUR_GEMINI_KEY"
      }
    },
    "@21st-dev/magic": {
      "command": "npx",
      "args": ["-y", "@21st-dev/magic@latest"],
      "env": {
        "API_KEY": "YOUR_21ST_DEV_KEY"
      }
    }
  }
}
```

After editing, **completely quit and restart Claude Desktop** (not just close the window — fully quit the app).

---

## Making 21st.dev a Skill (Always Available)

The skill file has been created at:
```
construction-ai-billing/21st-dev-magic/SKILL.md
```

To install it globally for all projects:
1. Copy the `21st-dev-magic/` folder to `~/.claude/skills/`
2. Or in Claude Code: `claude skill install ./21st-dev-magic`

This ensures every Claude session knows to use the 21st.dev MCP tools automatically.
