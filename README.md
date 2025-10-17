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

**Backend API** (since v1.1.0):
- `GET /api/instances` - List all instances
- `POST /api/instances` - Create new instance
- `DELETE /api/instances/:id` - Delete instance
- `GET /api/instances/:id/state` - Get controller state (products, interval, layout)
- `PUT /api/instances/:id/state` - Save controller state

This allows managing instances from multiple devices without localStorage limitations.

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

### 2. Configure Products

In the controller:
- Set rotation interval (seconds)
- Add products (HTML or image tags):
  
  **Card mode** (image + description):
  ```html
  <figure class="product-card">
    <img src="/products/CzarPrl.webp" alt="Czar PRL" />
    <figcaption>
      <h2>Czar PRL</h2>
      <p>Zapieckanka z pieczarkami, serem i szczypiorkiem.</p>
    </figcaption>
  </figure>
  ```
  
  **Image mode** (fullscreen, no padding):
  ```html
  <img src="/products/CzarPrl.webp">
  ```

- Choose layout mode (card or fullscreen image)
- Click **Start**

### 3. Open Screens

On each display device (Raspberry Pi, phone, TV browser):

1. Open `https://your-domain.com/screen.html?instance=kielce&pos=0`
2. For multiple screens:
   - Screen 1: `?instance=kielce&pos=0`
   - Screen 2: `?instance=kielce&pos=1`
   - Screen 3: `?instance=kielce&pos=2`
   - etc.

Each screen will display a different product from the rotation, synchronized to the millisecond.

### 4. Multiple Locations

To run screens in different cities:

**Kielce:**
- Instance: "kielce"
- Products: Menu Kielce
- Screens: `?instance=kielce&pos=0`, `?instance=kielce&pos=1`, ...

**Poznań:**
- Instance: "poznan"
- Products: Menu Poznań
- Screens: `?instance=poznan&pos=0`, `?instance=poznan&pos=1`, ...

Each instance is completely independent. You can start/stop/modify one without affecting the other.

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

### Nginx Configuration

**Example: zapieckanki.skycamp.pl**

```nginx
# /etc/nginx/sites-available/zapieckanki

server {
    listen 443 ssl;
    http2 on;
    server_name zapieckanki.skycamp.pl;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/zapieckanki-screen/dist;
    index index.html;

    # Frontend (static files)
    location / {
        try_files $uri $uri/ /index.html;
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
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000/health;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name zapieckanki.skycamp.pl;
    return 301 https://$server_name$request_uri;
}
```

**Systemd service for relay:**

```ini
# /etc/systemd/system/zapieckanki-relay.service

[Unit]
Description=Zapieckanki Pusher Relay
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/var/www/zapieckanki-screen
ExecStart=/usr/bin/node server.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable zapieckanki-relay
sudo systemctl start zapieckanki-relay
```

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

### Flickering on production

- Old sessions cached – hard refresh: Cmd+Shift+R (Mac) / Ctrl+F5 (Windows)
- Check for duplicate Pusher events in Network → WS tab (should be one per action)

## 📝 License

MIT

## 🙏 Credits

Built with:
- [Vite](https://vitejs.dev/)
- [Pusher Channels](https://pusher.com/channels)
- [TypeScript](https://www.typescriptlang.org/)
