# Installation Guide

## Prerequisites

- Modern browser with WebGL 2.0 support (Chrome 56+, Firefox 51+, Safari 15+)
- Python 3.x OR Node.js 18+ (for local development server)
- Git (for version control)

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/polymir.git
cd polymir
```

### 2. Verify Dependencies

Check that Three.js is present:

```bash
ls -lh src/lib/three.module.js
```

Expected output: File size ~1.1MB

### 3. Start Development Server

Option A: Python (simplest)
```bash
python -m http.server 8000
```

Option B: Node.js serve
```bash
npx serve .
```

Option C: Node.js http-server
```bash
npx http-server -p 8000
```

### 4. Open Browser

Navigate to: http://localhost:8000

You should see:
- Rotating wireframe cube (Three.js test)
- Status: "Engine running - Architecture complete, awaiting module implementation"

## Backend Setup (Optional)

The backend is optional for V1. Client runs entirely in browser with procedural generation.

### Install Backend Dependencies

```bash
cd backend
npm install
```

### Configure Cloudflare

1. Create Cloudflare account at https://cloudflare.com
2. Install Wrangler CLI: `npm install -g wrangler`
3. Login: `wrangler login`
4. Create R2 bucket: `wrangler r2 bucket create polymir-mvox`
5. Create D1 database: `wrangler d1 create polymir-db`
6. Update `wrangler.toml` with database ID

### Run Backend Locally

```bash
npx wrangler dev
```

Backend runs at: http://localhost:8787

### Deploy Backend

```bash
npx wrangler deploy
```

## Troubleshooting

### Three.js Not Loading

If Three.js fails to load, re-download:

```bash
cd src/lib
curl -o three.module.js https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js
```

### CORS Errors

If you see CORS errors, ensure you are using a local server (not file://).

### Module Import Errors

Ensure your browser supports ES6 modules. Update to latest version if needed.

## Development Workflow

1. Make changes to source files in `src/`
2. Refresh browser (no build step required)
3. Check browser console for errors
4. Use browser DevTools for debugging

## Next Steps

After verifying installation:

1. Review README.md TODO list
2. Start with Phase 1: Foundation modules (math/, data/, utils/)
3. Follow dependency hierarchy bottom-up
4. Run tests after implementing each module

## File Structure Check

Verify your directory structure:

```
polymir/
├── index.html                 ✓ Entry point
├── package.json              ✓ Project metadata
├── src/
│   └── lib/
│       └── three.module.js   ✓ Three.js (1.1MB)
├── backend/
│   ├── package.json          ✓ Backend dependencies
│   └── wrangler.toml         ✓ Cloudflare config
└── README.md                 ✓ Project overview
```

## Support

- GitHub Issues: https://github.com/yourusername/polymir/issues
- Documentation: /docs/
- Examples: /examples/
