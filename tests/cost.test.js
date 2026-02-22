const { expect } = require('chai');
const { createDriver, takeScreenshot } = require('./utils/testHelpers');
const CostPage = require('./pages/CostPage');

describe('Cost & Tokens Dashboard - E2E Tests', function() {
  let driver;
  let costPage;

  // Set longer timeout for Selenium tests
  this.timeout(60000);

  before(async function() {
    console.log('Starting Chrome WebDriver...');
    driver = await createDriver();
    costPage = new CostPage(driver);
  });

  after(async function() {
    if (driver) {
      await driver.quit();
    }
  });

  afterEach(async function() {
    if (this.currentTest.state === 'failed') {
      await takeScreenshot(driver, this.currentTest.title.replace(/\s+/g, '_'));
    }
  });

  describe('Page Load and Basic Structure', function() {
    it('should load the Cost & Tokens page successfully', async function() {
      await costPage.navigate();
      const isLoaded = await costPage.verifyPageLoaded();
      expect(isLoaded).to.be.true;
    });

    it('should display the page title', async function() {
      const title = await costPage.getPageTitle();
      expect(title).to.not.be.empty;
      console.log(`Page title: ${title}`);
    });
  });

  describe('KPI Cards', function() {
    before(async function() {
      await costPage.navigate();
      await costPage.waitForKpiCardsToLoad();
    });

    it('should display 6 KPI cards', async function() {
      const kpiValues = await costPage.getAllKpiValues();
      expect(Object.keys(kpiValues)).to.have.lengthOf(6);
      console.log('KPI Values:', kpiValues);
    });

    it('should display Total Cost KPI', async function() {
      const totalCost = await costPage.getKpiValue('Total Cost');
      expect(totalCost).to.not.be.empty;
      expect(totalCost).to.match(/\$|USD/); // Should contain currency symbol
      console.log(`Total Cost: ${totalCost}`);
    });

    it('should display Average Cost per User KPI', async function() {
      const avgCostPerUser = await costPage.getKpiValue('Average Cost per User');
      expect(avgCostPerUser).to.not.be.empty;
      console.log(`Average Cost per User: ${avgCostPerUser}`);
    });

    it('should display Total Tokens KPI', async function() {
      const totalTokens = await costPage.getKpiValue('Total Tokens');
      expect(totalTokens).to.not.be.empty;
      console.log(`Total Tokens: ${totalTokens}`);
    });

    it('should display Cost per 1M Tokens KPI', async function() {
      const costPer1M = await costPage.getKpiValue('Cost per 1M Tokens');
      expect(costPer1M).to.not.be.empty;
      console.log(`Cost per 1M Tokens: ${costPer1M}`);
    });

    it('should display Avg Cost per Request KPI (NEW)', async function() {
      const avgCostPerRequest = await costPage.getKpiValue('Avg Cost per Request');
      expect(avgCostPerRequest).to.not.be.empty;
      console.log(`Avg Cost per Request: ${avgCostPerRequest}`);
    });

    it('should display Cost per User-Day KPI (NEW)', async function() {
      const costPerUserDay = await costPage.getKpiValue('Cost per User-Day');
      expect(costPerUserDay).to.not.be.empty;
      console.log(`Cost per User-Day: ${costPerUserDay}`);
    });

    it('should display icons in KPI cards', async function() {
      const hasIcons = await costPage.hasKpiIcons();
      expect(hasIcons).to.be.true;
      
      const icons = await costPage.getKpiIcons();
      console.log(`Found ${icons.length} KPI icons:`, icons);
      expect(icons).to.have.lengthOf(6);
    });
  });

  describe('Warning Banner', function() {
    before(async function() {
      await costPage.navigate();
      await costPage.waitForKpiCardsToLoad();
    });

    it('should check for zero-cost models warning', async function() {
      const hasWarning = await costPage.hasWarningBanner();
      console.log(`Warning banner present: ${hasWarning}`);
      
      if (hasWarning) {
        const warningMessage = await costPage.getWarningMessage();
        console.log(`Warning message: ${warningMessage}`);
        expect(warningMessage).to.include('Warning');
        expect(warningMessage).to.include('no cost');
      }
    });
  });

  describe('Charts and Visualizations', function() {
    before(async function() {
      await costPage.navigate();
      await costPage.waitForChartsToLoad();
    });

    it('should display Daily Cost Trend chart', async function() {
      const hasChart = await costPage.hasChart('Daily Cost Trend');
      expect(hasChart).to.be.true;
      console.log('✓ Daily Cost Trend chart found');
    });

    it('should display Vendor Cost Trend chart (NEW)', async function() {
      const hasChart = await costPage.hasChart('Vendor Cost Trend');
      expect(hasChart).to.be.true;
      console.log('✓ Vendor Cost Trend chart found');
    });

    it('should display Cost vs Usage Analysis scatter plot (NEW)', async function() {
      await costPage.scrollToChart('Cost vs Usage Analysis');
      const hasChart = await costPage.hasChart('Cost vs Usage Analysis');
      expect(hasChart).to.be.true;
      console.log('✓ Cost vs Usage Analysis chart found');
    });

    it('should display Cost by Model donut chart', async function() {
      const hasChart = await costPage.hasChart('Cost by Model');
      expect(hasChart).to.be.true;
      console.log('✓ Cost by Model chart found');
    });

    it('should display Token Distribution bar chart', async function() {
      const hasChart = await costPage.hasChart('Token Distribution');
      expect(hasChart).to.be.true;
      console.log('✓ Token Distribution chart found');
    });

    it('should display Top 10 Users chart', async function() {
      await costPage.scrollToChart('Top 10 Users');
      const hasChart = await costPage.hasChart('Top 10 Users');
      expect(hasChart).to.be.true;
      console.log('✓ Top 10 Users chart found');
    });

    it('should verify all charts are present', async function() {
      const charts = await costPage.verifyAllChartsExist();
      console.log('Chart verification:', charts);
      
      expect(charts.dailyCostTrend).to.be.true;
      expect(charts.vendorCostTrend).to.be.true;
      expect(charts.costUsageAnalysis).to.be.true;
      expect(charts.costByModel).to.be.true;
      expect(charts.tokenDistribution).to.be.true;
      expect(charts.topUsers).to.be.true;
    });

    it('should have at least 6 charts rendered', async function() {
      const chartCount = await costPage.getChartCount();
      console.log(`Total charts rendered: ${chartCount}`);
      expect(chartCount).to.be.at.least(6);
    });
  });

  describe('Data Table', function() {
    before(async function() {
      await costPage.navigate();
      await driver.sleep(3000); // Wait for table to load
    });

    it('should display the cost breakdown table', async function() {
      const hasTable = await costPage.hasTable();
      expect(hasTable).to.be.true;
      console.log('✓ Cost breakdown table found');
    });

    it('should have table headers', async function() {
      const headers = await costPage.getTableHeaders();
      console.log('Table headers:', headers);
      expect(headers.length).to.be.greaterThan(0);
      
      // Expected headers
      expect(headers.some(h => h.includes('Date'))).to.be.true;
      expect(headers.some(h => h.includes('Model'))).to.be.true;
      expect(headers.some(h => h.includes('Cost'))).to.be.true;
    });

    it('should display table rows with data', async function() {
      const rowCount = await costPage.getTableRowCount();
      console.log(`Table rows: ${rowCount}`);
      expect(rowCount).to.be.greaterThan(0);
    });
  });

  describe('Visual Regression - Screenshots', function() {
    before(async function() {
      await costPage.navigate();
      await costPage.waitForChartsToLoad();
    });

    it('should take full page screenshot', async function() {
      await costPage.takeFullPageScreenshot('cost-dashboard-full-page.png');
      console.log('✓ Full page screenshot saved');
    });

    it('should take screenshot of KPI section', async function() {
      await costPage.takeFullPageScreenshot('cost-dashboard-kpi-section.png');
      console.log('✓ KPI section screenshot saved');
    });
  });

  describe('Performance and Load Times', function() {
    it('should load page within acceptable time', async function() {
      const startTime = Date.now();
      await costPage.navigate();
      await costPage.waitForKpiCardsToLoad();
      const loadTime = Date.now() - startTime;
      
      console.log(`Page load time: ${loadTime}ms`);
      expect(loadTime).to.be.lessThan(15000); // Should load in under 15 seconds
    });

    it('should load charts within acceptable time', async function() {
      await costPage.navigate();
      const startTime = Date.now();
      await costPage.waitForChartsToLoad();
      const loadTime = Date.now() - startTime;
      
      console.log(`Charts load time: ${loadTime}ms`);
      expect(loadTime).to.be.lessThan(20000); // Charts should load in under 20 seconds
    });
  });

  describe('Responsive Design - Different Viewports', function() {
    const viewports = [
      { name: 'Desktop', width: 1920, height: 1080 },
      { name: 'Laptop', width: 1366, height: 768 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 }
    ];

    viewports.forEach((viewport) => {
      it(`should display correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async function() {
        await driver.manage().window().setRect({
          width: viewport.width,
          height: viewport.height
        });
        
        await costPage.navigate();
        await costPage.waitForKpiCardsToLoad();
        
        const hasKpis = await costPage.hasKpiIcons();
        expect(hasKpis).to.be.true;
        
        await costPage.takeFullPageScreenshot(`cost-dashboard-${viewport.name.toLowerCase()}.png`);
        console.log(`✓ ${viewport.name} layout verified`);
      });
    });
  });
});
