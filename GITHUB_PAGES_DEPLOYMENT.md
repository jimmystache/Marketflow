# GitHub Pages Deployment Guide for MarketFlow

## ✅ What's Been Configured

Your Angular app is now set up for GitHub Pages deployment at:
**https://jimmystache.github.io/Marketflow/**

### Changes Made:
1. **angular.json** - Added `baseHref: "/Marketflow/"` to production config
2. **package.json** - Added `build:prod` and `deploy` scripts
3. **.github/workflows/deploy.yml** - GitHub Actions workflow for automatic deployment
4. **public/.nojekyll** - Tells GitHub Pages to skip Jekyll processing
5. **public/404.html** - Handles client-side routing for SPA navigation

## 🚀 Deployment Methods

### Option 1: Automatic (Recommended)
Every push to `main` branch triggers automatic deployment via GitHub Actions.

**Setup Steps:**
1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Configure GitHub Pages deployment"
   git push origin main
   ```

2. Go to your repository Settings → Pages
   - Ensure **Source** is set to "GitHub Actions"
   - The workflow will build and deploy automatically

3. Check workflow status:
   - Go to Actions tab in your GitHub repo
   - You'll see the "Deploy to GitHub Pages" workflow running
   - Once complete (✓), your app will be live at https://jimmystache.github.io/Marketflow/

### Option 2: Manual Deployment
Deploy directly from your machine:

**Prerequisites:**
1. Ensure you have Git configured with proper credentials
2. Run from the `marketflow-angular` directory

**Steps:**
```bash
cd marketflow-angular
npm install
npm run deploy
```

The `angular-cli-ghpages` tool will:
- Build your app in production mode
- Create a `gh-pages` branch automatically
- Push the build output to that branch
- GitHub will serve it as your GitHub Pages site

## 🔧 Configuration Details

### Base Href
The app is configured to load from `/Marketflow/` (not the root). This is reflected in:
- `angular.json`: `"baseHref": "/Marketflow/"`
- `package.json`: `"deploy": "ng deploy --base-href=/Marketflow/"`
- HTML routing will work correctly with this path

### Environment Variables
If your app uses environment-specific configs (Supabase, APIs), make sure:
- Development: `src/environments/environment.ts`
- Production: `src/environments/environment.prod.ts` (if it exists)

For sensitive data (API keys, tokens), use GitHub Secrets:
1. Go to Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add secrets and reference in workflow: `${{ secrets.SECRET_NAME }}`

## 📋 Monitoring Deployment

1. **GitHub Actions Tab**
   - Shows each deployment attempt
   - View logs if anything fails
   - Re-run failed deployments

2. **Pages Status**
   - Settings → Pages shows deployment status
   - Usually takes 30-60 seconds

3. **Test Your Site**
   - Visit https://jimmystache.github.io/Marketflow/
   - All routes should work (they'll redirect through 404.html if needed)

## ⚠️ Common Issues

### Blank page or 404 errors
- Clear browser cache (Ctrl+Shift+Delete)
- Check GitHub Actions for build errors
- Verify `baseHref` is set correctly in angular.json

### Assets not loading
- Ensure `baseHref` is `/Marketflow/` not `Marketflow` (needs leading slash)
- Check browser DevTools → Network tab for 404s

### Routes not working
- The 404.html file handles client-side routing
- Make sure it's in the `public/` folder
- Verify `.nojekyll` file exists in public/

### Supabase API calls failing
- Supabase isn't available in the browser build by default
- This app likely needs a backend proxy (see `tools/fm-proxy/`)
- Configure CORS in Supabase settings if calling directly

## 📦 Build Size

Your current build budget from angular.json:
- Initial bundle: 1MB warning / 2MB error
- Component styles: 50KB warning / 100KB error

Monitor with:
```bash
npm run build -- --stats-json
```

## 🔄 Future Deployments

After initial setup, just push to `main`:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

The GitHub Actions workflow will automatically:
1. Install dependencies
2. Build your app
3. Deploy to GitHub Pages

**No manual deployment commands needed!**

---

**Questions?**
- GitHub Pages docs: https://docs.github.com/en/pages
- Angular deployment guide: https://angular.io/guide/deployment#deploy-to-github-pages
- angular-cli-ghpages: https://github.com/angular-schule/angular-cli-ghpages
