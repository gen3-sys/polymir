# External Dependencies

## Three.js r128

**Version:** 0.128.0
**License:** MIT
**Source:** https://threejs.org
**Purpose:** 3D graphics rendering library

### Why Vendored?

1. Version stability - Ensures consistent behavior across deployments
2. Offline capability - Works without CDN access
3. Performance - No external network requests
4. Security - No supply chain attacks via CDN

### Files

- `three.module.js` - ES6 module version (1.1MB)

### Usage

```javascript
import * as THREE from '../lib/three.module.js';
```

### Updating

To update Three.js version:

```bash
cd src/lib
curl -o three.module.js https://cdn.jsdelivr.net/npm/three@VERSION/build/three.module.js
```

Replace VERSION with desired version number.
