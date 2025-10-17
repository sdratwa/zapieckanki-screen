# Zapieckanki Screen Rotation

Multi-tenant, multi-screen product rotator with perfect synchronization. Control unlimited screens across different devices and locations with server-time sync.

## 🚀 Quick Start

### Development (local)

```bash
npm install

# Terminal 1: Start Vite dev server
npm run dev

# Terminal 2: Start Pusher relay server
npm run server
```

Open http://localhost:5173/ to create your first instance and launch screens.

### Production Deployment

1. **Build the frontend:**
```bash
   # Create .env.local with production values
   echo "VITE_PUSHER_KEY=your-key" > .env.local
   echo "VITE_PUSHER_CLUSTER=eu" >> .env.local
   # VITE_PUSHER_ENDPOINT defaults to '/trigger' - no need to set
   
npm run build
```

2. **Deploy `dist/` to your web server** (Nginx, Apache, etc.)

3. **Run relay server on VPS:**
   ```bash
   # .env on server
   PUSHER_APP_ID=...
   PUSHER_KEY=...
   PUSHER_SECRET=...
   PUSHER_CLUSTER=eu
   PORT=3000
   
   # Run with systemd (see Nginx setup section)
   sudo systemctl start zapieckanki-relay
   ```

## 🏗️ Architecture

### Multi-Instance System

Each **instance** is a separate set of synchronized screens (e.g., "Kielce", "Poznań"). Instances are:
- Isolated (different products, timers, start/stop independently)
- Multi-channel (each uses a unique Pusher channel: `rotation-kielce`, `rotation-poznan`)
- **Centrally stored** in backend JSON files (accessible from any device/browser)

**Backend API**:
- `GET /api/instances` - List all instances
- `POST /api/instances` - Create new instance
- `DELETE /api/instances/:id` - Delete instance
- `GET /api/instances/:id/config` - Get instance configuration (ad groups + screen assignments)
- `PUT /api/instances/:id/config` - Save instance configuration
- `POST /api/instances/:id/groups` - Create new ad group
- `PUT /api/instances/:id/groups/:groupId` - Update ad group
- `DELETE /api/instances/:id/groups/:groupId` - Delete ad group

This allows managing instances from multiple devices without localStorage limitations.

### Ad Groups Architecture (v1.2.0+)

**Ad Groups** are the core unit of content management. Each group represents a set of products with specific display settings.

#### Group Types:

**1. Carousel (Rotating Products)**
- Multiple products rotate automatically
- Configurable interval (e.g., 10 seconds)
- Perfect synchronization across all assigned screens
- Autonomous timer (controller can be closed)

**2. Static (Single Product)**
- Displays one product without rotation
- Ideal for menus, static ads, announcements
- No timer, no animation
- Instant updates when group is modified

#### Screen Assignments:

Each screen is assigned to **one group**. Multiple screens can be assigned to the same group:
- **Same group (carousel)**: Screens rotate in sync, displaying different products
- **Same group (static)**: All screens show the same product
- **Different groups**: Each screen displays content from its assigned group independently

#### Example Configuration:

```typescript
{
  adGroups: [
    {
      id: "products",
      name: "Produkty",
      type: "carousel",
      products: ["<img src='/products/1.webp'>", ...],
      intervalSeconds: 10,
      layoutMode: "image",
      productionMode: true
    },
    {
      id: "menu",
      name: "Menu",
      type: "static",
      products: ["<img src='/menu/main.webp'>"],
      layoutMode: "image",
      productionMode: false
    }
  ],
  screenAssignments: {
    "0": "products",  // Screens 0, 1, 2 → carousel
    "1": "products",
    "2": "products",
    "3": "menu"       // Screen 3 → static menu
  }
}
```

### Server-Time Synchronization

Screens operate **autonomously** with perfect sync:

1. **Controller** sends `init` event with:
   - `serverTime` (from relay server, microsecond precision)
   - `intervalMs` (rotation interval)
   - `products` (list of products)

2. **Each screen** runs its own timer:
   ```typescript
   globalIndex = floor((Date.now() - serverTime) / intervalMs)
   myProductIndex = (globalIndex + screenPos) % products.length
   ```

3. **Drift correction** every 10s ensures screens stay in sync even with clock skew

4. **Works across networks** – screens can be in different cities, connected via internet

### Benefits

✅ **Controller can be closed** – screens continue rotating independently  
✅ **Late-joining screens** auto-sync to current product  
✅ **Network-agnostic** – screens can be on different devices/networks  
✅ **Sub-second accuracy** – ±10-50ms sync precision (limited by network latency)  

## 📖 Usage

### 1. Create an Instance

1. Open http://your-domain.com/
2. Enter instance ID (e.g., "kielce") and click "Utwórz"
3. Click "📋 Kontroler" to open controller for this instance

By default, new instances are created with one carousel group containing all 14 product images, and 3 screens (0, 1, 2) assigned to this group.

### 2. Manage Ad Groups

In the controller, you'll see the **Ad Groups** section with all your content groups.

#### Create New Group:

1. Click "+ Nowa grupa"
2. Fill in the form:
   - **Nazwa**: e.g., "Menu śniadaniowe", "Promocje", "Reklamy"
   - **Typ**: 
     - **Karuzela** (rotating products)
     - **Statyczny** (single product)
   - **Interwał**: rotation speed (only for carousel)
   - **Tryb wyświetlania**:
     - **Karta produktu** (image + description)
     - **Pełnoekranowa grafika** (image only)
   - **Tryb produkcyjny**: Hide UI counters ("Screen #n", "Produkt X z Y")
   - **Produkty**: Paste HTML content
3. Click "Zapisz"

#### Product Format:

**For Carousel (multiple products):**

```html
<img src="/products/CzarPrl.webp" alt="Czar PRL" />

<img src="/products/Baltona.webp" alt="Baltona" />

<img src="/products/Borewicza.webp" alt="Borewicza" />
```
*Separate products with blank lines (double newline)*

**For Static (single product):**

```html
<img src="/menu/breakfast.webp" alt="Menu śniadaniowe" />
```

**Card mode with description:**

```html
<figure class="product-card">
  <img src="/products/CzarPrl.webp" alt="Czar PRL" />
  <figcaption>
    <h2>Czar PRL</h2>
    <p>Zapieckanka z pieczarkami, serem i szczypiorkiem.</p>
  </figcaption>
</figure>
```

### 3. Assign Screens to Groups

In the **Przypisanie ekranów** section:
1. Click "+ Dodaj ekran" to add a new screen
2. Enter screen number (0-99)
3. Select group from dropdown for each screen

**Example:**
- Screen #0, #1, #2 → "Produkty" (carousel)
- Screen #3 → "Menu" (static)

### 4. Control Groups

**Per-Group Control:**
- Each carousel group has **▶️ START** and **⏹️ STOP** buttons
- Static groups have no controls (always visible)

**Global Control:**
- **▶️ START wszystkie grupy** - starts all carousel groups at once
- **⏹️ STOP wszystkie grupy** - stops all groups

### 5. Open Screens

Use the **Launcher ekranów** section:
1. Set screen number (0-99)
2. Click "🖥️ Otwórz ekran"

Or open manually:
- `https://your-domain.com/screen.html?instance=kielce&pos=0`
- `https://your-domain.com/screen.html?instance=kielce&pos=1`
- etc.

Each screen will display content from its assigned group.

### 6. Example Use Cases

#### Use Case 1: Product Rotation + Static Menu

**Groups:**
- "Produkty" (carousel, 10s interval, 14 products)
- "Menu" (static, 1 product)

**Screens:**
- Screens 0, 1, 2 → "Produkty" (rotating)
- Screen 3 → "Menu" (static)

**Result:** 3 screens rotate products in sync, 4th screen shows static menu.

#### Use Case 2: Time-Based Content (Manual Switching)

**Groups:**
- "Menu śniadaniowe" (static)
- "Menu obiadowe" (static)
- "Menu kolacja" (static)

**Screens:**
- Screen 0 → switch group assignment manually based on time of day

**Result:** Same screen, different content at different times (by manually changing screen assignment).

*Note: Automatic time-based switching (harmonogram) is planned for future release.*

#### Use Case 3: Multiple Locations

**Kielce Instance:**
- Groups: "Produkty Kielce", "Menu Kielce"
- Screens 0-3 assigned to different groups

**Poznań Instance:**
- Groups: "Produkty Poznań", "Menu Poznań"
- Screens 0-3 assigned to different groups

**Result:** Two completely independent setups in different cities.

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```ini
PUSHER_APP_ID=123456
PUSHER_KEY=abcdef123456
PUSHER_SECRET=secret123456
PUSHER_CLUSTER=eu
PORT=3000
```

**Frontend (.env.local):**
```ini
VITE_PUSHER_KEY=abcdef123456
VITE_PUSHER_CLUSTER=eu
# VITE_PUSHER_ENDPOINT=/trigger  # Optional - defaults to '/trigger' (relative URL)
```

**Important:** 
- `VITE_` prefix is required for Vite to expose variables to frontend
- `VITE_PUSHER_ENDPOINT` is **optional** - defaults to `/trigger` (relative URL)
- Relative URL `/trigger` works both locally (Vite proxy) and in production (Nginx proxy)
- No need to hardcode your domain!

### Pusher Setup

1. Create app at [Pusher Channels](https://dashboard.pusher.com/)
2. Copy credentials to `.env` (backend) and `.env.local` (frontend)
3. In Pusher dashboard, enable "Client Events" if you want bi-directional communication (optional)

### How `/trigger` endpoint works

**Development (npm run dev):**
- Vite dev server runs on `http://localhost:5173`
- Vite proxy forwards `/trigger` → `http://localhost:3000/trigger` (relay server)
- Configured in `vite.config.ts`

**Production:**
- Nginx serves static files from `dist/`
- Nginx proxies `/trigger` → `http://localhost:3000/trigger` (relay server)
- Configured in nginx config (see below)

This approach means:
- ✅ No hardcoded domains in code
- ✅ Works in any environment (local, staging, production)
- ✅ Easy to deploy to different domains

### Production Deployment (Complete Guide)

#### Step 1: Deploy Backend on VPS

1. **Clone the repository:**
   ```bash
   cd /var/www
   git clone https://github.com/your-username/zapieckanki-screen.git
   cd zapieckanki-screen
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   nano .env
   ```
   
   Add your Pusher credentials:
   ```ini
   PUSHER_APP_ID=123456
   PUSHER_KEY=your-pusher-key
   PUSHER_SECRET=your-pusher-secret
   PUSHER_CLUSTER=eu
   PORT=3000
   ```

3. **Create systemd service:**
   ```bash
   sudo nano /etc/systemd/system/zapieckanki-relay.service
   ```
   
   Paste this configuration:
   ```ini
   [Unit]
   Description=Zapieckanki Pusher Relay & API Backend
   After=network.target
   
   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/zapieckanki-screen
   ExecStart=/usr/bin/npm run server
   Restart=always
   RestartSec=10
   Environment=NODE_ENV=production
   
   [Install]
   WantedBy=multi-user.target
   ```

4. **Enable and start the service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable zapieckanki-relay
   sudo systemctl start zapieckanki-relay
   ```

5. **Check service status:**
   ```bash
   sudo systemctl status zapieckanki-relay
   ```
   
   You should see "Active: active (running)" ✅

6. **View logs (if needed):**
   ```bash
   sudo journalctl -u zapieckanki-relay -f
   ```

**Service Management Commands:**

```bash
# Start service
sudo systemctl start zapieckanki-relay

# Stop service
sudo systemctl stop zapieckanki-relay

# Restart service (after code updates)
sudo systemctl restart zapieckanki-relay

# Check status
sudo systemctl status zapieckanki-relay

# View logs
sudo journalctl -u zapieckanki-relay -n 50
```

#### Step 2: Build Frontend

1. **Create `.env.local` with production values:**
   ```bash
   echo "VITE_PUSHER_KEY=your-pusher-key" > .env.local
   echo "VITE_PUSHER_CLUSTER=eu" >> .env.local
   ```

2. **Build the frontend:**
   ```bash
   npm run build
   ```

3. **Upload `dist/` to VPS:**
   ```bash
   rsync -avz dist/ user@your-vps:/var/www/zapieckanki-screen/dist/
   ```

#### Step 3: Configure Nginx

Create Nginx configuration with **cache for static files** (images, JS, CSS):

```bash
sudo nano /etc/nginx/sites-available/zapieckanki.skycamp.pl.conf
```

**Complete Nginx configuration:**

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name zapieckanki.skycamp.pl;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name zapieckanki.skycamp.pl;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    root /var/www/zapieckanki-screen/dist;
    index index.html;

    # ===== CACHE FOR IMAGES AND STATIC FILES =====
    # This prevents image flickering on production!
    location ~* \.(webp|jpg|jpeg|png|gif|ico|svg|js|css|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Cache for Vite bundled assets
    location /assets/ {
        try_files $uri =404;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # No cache for HTML pages (for instant updates)
    location = / {
        try_files /index.html =404;
        add_header Cache-Control "no-store";
    }

    location = /controller.html {
        try_files /controller.html =404;
        add_header Cache-Control "no-store";
    }

    location = /screen.html {
        try_files /screen.html =404;
        add_header Cache-Control "no-store";
    }

    # Backend API (instances and state)
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend (Pusher relay)
    location /trigger {
        proxy_pass http://localhost:3000/trigger;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        add_header Cache-Control "no-store";
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000/health;
    }

    # SPA routing fallback
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-store";
    }

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
```

**Enable the site:**

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/zapieckanki.skycamp.pl.conf /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

#### Why Cache is Important

**Without cache (problems):**
- ❌ Images reload on every animation (200 OK response, 100+ KB each)
- ❌ Flickering/blinking during transitions (Chrome re-renders)
- ❌ High bandwidth usage (3-4 full image downloads per rotation)
- ❌ Slow performance on mobile devices

**With cache (fixed):**
- ✅ Images load once, then from cache (304 Not Modified, 0 KB)
- ✅ Smooth animations, no flickering
- ✅ Minimal bandwidth (only new products downloaded)
- ✅ Fast performance, instant transitions

## 🖥️ Hardware Recommendations

### Raspberry Pi 5 for 4K Displays

**For 2x 4K screens:**
- **RAM:** 4GB or 8GB (4GB sufficient, 8GB recommended for future-proofing)
- **microSD:** 64GB Class 10 (100 MB/s read speed is fine, faster not needed)
- **OS:** Raspberry Pi OS Lite (64-bit) with Chromium
- **Browser:** Chromium in kiosk mode

**Setup:**
```bash
# Install Chromium
sudo apt install chromium-browser

# Auto-start in kiosk mode (add to /etc/xdg/lxsession/LXDE-pi/autostart)
@chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble \
  https://yourdomain.com/screen.html?instance=kielce&pos=0
```

**Multiple screens on one Pi:**
- Screen 1 (HDMI 0): `...&pos=0 --window-position=0,0 --window-size=3840,2160`
- Screen 2 (HDMI 1): `...&pos=1 --window-position=3840,0 --window-size=3840,2160`

## 🐛 Troubleshooting

### Screens not syncing

1. Check browser console for errors (F12)
2. Verify `instanceId` matches between controller and screen URLs
3. Check Pusher Debug Console: https://dashboard.pusher.com/ → Your App → Debug Console
4. Ensure relay server is running: `curl https://yourdomain.com/health`

### "This page is not secure" warning

- Ensure your site is served over HTTPS
- Check Nginx is properly configured with SSL certificates
- Default `/trigger` endpoint uses relative URL (works with HTTPS automatically)
- Clear browser cache (Cmd+Shift+R / Ctrl+F5)

### Drift / screens out of sync

- Check system clocks on all devices (should be ±1 second)
- Ensure network latency is stable (<500ms)
- Restart screens to resync to latest `serverTime`

### Flickering/blinking images on production

**Most common cause:** Missing Nginx cache configuration for images

**Symptoms:**
- Dev works smoothly, production flickers
- Network tab shows `200 OK` for images on every animation (instead of `304 Not Modified`)
- Same images downloaded multiple times

**Solution:**
1. Add cache configuration to Nginx (see "Production Deployment" section above)
2. Reload Nginx: `sudo systemctl reload nginx`
3. Hard refresh browser: Cmd+Shift+R (Mac) / Ctrl+F5 (Windows)
4. Check Network tab: images should now show `304` status (from cache)

**Other causes:**
- Old sessions cached – hard refresh: Cmd+Shift+R (Mac) / Ctrl+F5 (Windows)
- Check for duplicate Pusher events in Network → WS tab (should be one per action)

## 📝 License

MIT

## 🙏 Credits

Built with:
- [Vite](https://vitejs.dev/)
- [Pusher Channels](https://pusher.com/channels)
- [TypeScript](https://www.typescriptlang.org/)
