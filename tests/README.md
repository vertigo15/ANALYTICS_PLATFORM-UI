# Analytics Platform - E2E Tests

Comprehensive Selenium-based end-to-end tests for the Jeen Analytics Platform.

## Overview

This test suite uses:
- **Selenium WebDriver** for browser automation
- **Mocha** as the test framework  
- **Chai** for assertions
- **Page Object Model** design pattern for maintainability

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Chrome** browser installed
3. **Running application** - The app must be running at `http://localhost:3000`

## Installation

```powershell
cd tests
npm install
```

## Configuration

Edit `.env.test` to configure:

```env
BASE_URL=http://localhost:3000
API_URL=http://localhost:3001
HEADLESS=false           # Set to true for CI/CD
TIMEOUT=30000
SCREENSHOT_ON_FAILURE=true
SCREENSHOT_DIR=./screenshots
```

## Running Tests

### Run all tests
```powershell
npm test
```

### Run Cost dashboard tests only
```powershell
npm run test:cost
```

### Run in headless mode (for CI/CD)
```powershell
npm run test:headless
```

### Run with live reload (watch mode)
```powershell
npm run test:watch
```

## Test Structure

```
tests/
├── cost.test.js          # Main test file for Cost dashboard
├── pages/
│   └── CostPage.js       # Page Object Model
├── utils/
│   └── testHelpers.js    # Helper functions
├── screenshots/          # Generated screenshots
├── package.json          # Dependencies
├── .env.test             # Configuration
└── README.md             # This file
```

## Test Coverage

### Cost & Tokens Dashboard

#### ✅ Page Load and Basic Structure
- Page loads successfully
- Page title is displayed

#### ✅ KPI Cards (6 cards)
- Total Cost
- Average Cost per User (NEW)
- Total Tokens
- Cost per 1M Tokens
- Avg Cost per Request (NEW)
- Cost per User-Day (NEW)
- Icons displayed in all KPI cards

#### ✅ Warning Banner
- Zero-cost models alert (conditional)

#### ✅ Charts and Visualizations (6 charts)
- Daily Cost Trend
- Vendor Cost Trend (NEW)
- Cost vs Usage Analysis (NEW - scatter plot)
- Cost by Model (donut)
- Token Distribution (bar)
- Top 10 Users (bar)

#### ✅ Data Table
- Cost breakdown table
- Table headers
- Table rows with data

#### ✅ Visual Regression
- Full page screenshots
- KPI section screenshots

#### ✅ Performance Testing
- Page load time < 15s
- Charts load time < 20s

#### ✅ Responsive Design
- Desktop (1920x1080)
- Laptop (1366x768)
- Tablet (768x1024)
- Mobile (375x667)

## Writing New Tests

### 1. Create a Page Object

```javascript
// pages/NewPage.js
class NewPage {
  constructor(driver) {
    this.driver = driver;
    this.baseUrl = process.env.BASE_URL;
    
    this.locators = {
      element: By.css('.selector')
    };
  }
  
  async navigate() {
    await this.driver.get(`${this.baseUrl}/path`);
  }
}
```

### 2. Create Test File

```javascript
// newpage.test.js
const { createDriver } = require('./utils/testHelpers');
const NewPage = require('./pages/NewPage');

describe('New Page Tests', function() {
  let driver, page;
  
  before(async function() {
    driver = await createDriver();
    page = new NewPage(driver);
  });
  
  it('should test something', async function() {
    await page.navigate();
    // assertions
  });
});
```

## Debugging

### Enable headful mode
Set `HEADLESS=false` in `.env.test` to see the browser

### Check screenshots
Failed tests automatically save screenshots to `./screenshots/`

### Increase timeouts
Edit `this.timeout(60000)` in test files for slow operations

### View console logs
Tests output detailed console logs during execution

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        working-directory: ./tests
        run: npm install
      
      - name: Start application
        run: docker compose up -d
      
      - name: Wait for app
        run: sleep 30
      
      - name: Run tests
        working-directory: ./tests
        run: npm run test:headless
        env:
          HEADLESS: true
      
      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-screenshots
          path: tests/screenshots/
```

## Troubleshooting

### Issue: "ChromeDriver not found"
**Solution**: Install chromedriver
```powershell
npm install chromedriver
```

### Issue: "Connection refused"
**Solution**: Make sure the app is running
```powershell
docker compose ps
# Should show web and api containers running
```

### Issue: "Element not found"
**Solution**: 
1. Increase timeout in `.env.test`
2. Check if element selector has changed
3. Run in headful mode to debug visually

### Issue: "Tests timing out"
**Solution**:
```javascript
this.timeout(120000); // Increase to 120 seconds
```

## Best Practices

1. **Use Page Object Model** - Keep selectors in page objects
2. **Wait for elements** - Always use `waitForElement()` before interacting
3. **Independent tests** - Each test should be able to run independently
4. **Descriptive names** - Use clear test names: `should display X when Y`
5. **Screenshots** - Automatic on failure, useful for debugging
6. **Clean up** - Always close driver in `after()` hook

## Reporting

### Generate HTML report (optional)

Install mochawesome:
```powershell
npm install --save-dev mochawesome
```

Run tests with reporter:
```powershell
mocha --reporter mochawesome --timeout 30000
```

View report:
```powershell
open mochawesome-report/mochawesome.html
```

## Contributing

When adding new tests:

1. Follow existing test structure
2. Use Page Object Model pattern
3. Add descriptive comments
4. Update this README with new coverage
5. Ensure tests pass locally before committing

## Support

For issues or questions:
1. Check `screenshots/` folder for visual debugging
2. Review console output for detailed logs
3. Check `.env.test` configuration
4. Verify application is running correctly

## Performance Benchmarks

Based on local testing:

| Metric | Target | Current |
|--------|--------|---------|
| Page Load | < 15s | ~8-10s |
| Charts Load | < 20s | ~12-15s |
| Total Test Suite | < 5min | ~3-4min |
| Individual Test | < 30s | ~10-20s |

## Future Improvements

- [ ] Add API mocking for deterministic tests
- [ ] Add visual regression testing with screenshot comparison
- [ ] Add accessibility (a11y) tests
- [ ] Add performance profiling tests
- [ ] Add cross-browser testing (Firefox, Safari, Edge)
- [ ] Add parallel test execution
- [ ] Add custom HTML reporter with charts
- [ ] Add test data fixtures for consistent testing
