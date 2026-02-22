# Quick Start - Running Selenium Tests

## 1. Prerequisites Check

Make sure the application is running:

```powershell
cd "C:\Users\user\OneDrive - JeenAI\Documents\code\ANALYTICS_PLATFORM-UI"
docker compose ps
```

You should see both `api` and `web` containers running.

If not running:
```powershell
docker compose up -d
```

## 2. Install Test Dependencies

```powershell
cd tests
npm install
```

This will install:
- selenium-webdriver
- chromedriver
- mocha
- chai
- dotenv

## 3. Run Tests

### Option A: Run all tests
```powershell
npm test
```

### Option B: Run Cost dashboard tests only
```powershell
npm run test:cost
```

### Option C: Run in headless mode (no browser window)
```powershell
$env:HEADLESS="true"
npm test
```

## 4. View Results

### Terminal Output
Tests will show:
- ✓ Pass (green)
- ✗ Fail (red)
- Test duration
- Console logs with values

### Screenshots
If tests fail, screenshots are saved to:
```
tests/screenshots/
```

## Example Output

```
Cost & Tokens Dashboard - E2E Tests
  Page Load and Basic Structure
    ✓ should load the Cost & Tokens page successfully (8234ms)
    ✓ should display the page title (45ms)
    
  KPI Cards
    ✓ should display 6 KPI cards (2341ms)
    ✓ should display Total Cost KPI (156ms)
    ✓ should display Average Cost per User KPI (123ms)
    ✓ should display icons in KPI cards (234ms)
    
  Charts and Visualizations
    ✓ should display Vendor Cost Trend chart (NEW) (1567ms)
    ✓ should display Cost vs Usage Analysis scatter plot (NEW) (1834ms)
    
  25 passing (45s)
```

## What Gets Tested

### ✅ New Features
- 6 KPI cards (added 2 new: Avg Cost per Request, Cost per User-Day)
- Icons in all KPI cards (💰 👤 🔢 📊 ⚡ 📅)
- Vendor Cost Trend chart
- Cost vs Usage Analysis scatter plot
- Zero-cost models warning banner

### ✅ Existing Features
- Daily Cost Trend
- Cost by Model donut
- Token Distribution bar
- Top 10 Users chart
- Cost breakdown table
- Page load performance
- Responsive design (4 viewports)

## Troubleshooting

### "ChromeDriver not found"
```powershell
npm install chromedriver --save-dev
```

### "Connection refused to localhost:3000"
Make sure Docker containers are running:
```powershell
docker compose ps
docker compose logs web
```

### "Element not found" errors
1. Check if page loaded: Look at screenshots in `tests/screenshots/`
2. Increase timeout: Edit `.env.test` and set `TIMEOUT=60000`
3. Run in visible mode: Set `HEADLESS=false` in `.env.test`

### Tests are slow
- First run is always slower (downloads ChromeDriver)
- Network latency affects API calls
- Charts take time to render
- Expected: 3-4 minutes for full suite

## Next Steps

1. ✅ Tests are installed and working
2. Add tests for other dashboards (Agents, Users, Documents, Operations)
3. Set up CI/CD pipeline (GitHub Actions, Jenkins, etc.)
4. Add visual regression testing
5. Add accessibility testing

## Support

- Full documentation: See `README.md`
- Test helpers: See `utils/testHelpers.js`
- Page objects: See `pages/CostPage.js`
- Test specs: See `cost.test.js`
