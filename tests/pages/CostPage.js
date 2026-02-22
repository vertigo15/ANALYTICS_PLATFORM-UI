const { By } = require('selenium-webdriver');
const {
  waitForElement,
  waitForPageLoad,
  waitForApiCalls,
  waitForChartsToLoad,
  getTextContent,
  elementExists,
  getAllElements,
  scrollToElement,
  clickElement
} = require('../utils/testHelpers');

/**
 * Page Object Model for Cost & Tokens Dashboard
 */
class CostPage {
  constructor(driver) {
    this.driver = driver;
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    // Page locators
    this.locators = {
      // KPI Cards
      kpiCards: By.css('[class*="grid"] > div'),
      totalCostCard: By.xpath('//p[contains(text(), "Total Cost")]/parent::div/following-sibling::p'),
      avgCostPerUserCard: By.xpath('//p[contains(text(), "Average Cost per User")]/parent::div/following-sibling::p'),
      totalTokensCard: By.xpath('//p[contains(text(), "Total Tokens")]/parent::div/following-sibling::p'),
      costPer1MTokensCard: By.xpath('//p[contains(text(), "Cost per 1M Tokens")]/parent::div/following-sibling::p'),
      avgCostPerRequestCard: By.xpath('//p[contains(text(), "Avg Cost per Request")]/parent::div/following-sibling::p'),
      costPerUserDayCard: By.xpath('//p[contains(text(), "Cost per User-Day")]/parent::div/following-sibling::p'),
      
      // KPI Card Icons
      kpiIcons: By.css('[role="img"]'),
      
      // Warning Banner
      warningBanner: By.css('[class*="bg-yellow-50"]'),
      warningMessage: By.xpath('//strong[text()="Warning:"]/parent::p'),
      
      // Charts
      dailyCostTrendChart: By.xpath('//h3[contains(text(), "Daily Cost Trend")]/ancestor::div[contains(@class, "bg-white")]//canvas'),
      vendorTrendChart: By.xpath('//h3[contains(text(), "Vendor Cost Trend")]/ancestor::div[contains(@class, "bg-white")]//canvas'),
      costUsageScatterChart: By.xpath('//h3[contains(text(), "Cost vs Usage Analysis")]/ancestor::div[contains(@class, "bg-white")]//canvas'),
      costByModelDonut: By.xpath('//h3[contains(text(), "Cost by Model")]/ancestor::div[contains(@class, "bg-white")]//canvas'),
      tokenDistributionBar: By.xpath('//h3[contains(text(), "Token Distribution")]/ancestor::div[contains(@class, "bg-white")]//canvas'),
      topUsersChart: By.xpath('//h3[contains(text(), "Top 10 Users")]/ancestor::div[contains(@class, "bg-white")]//canvas'),
      
      // Table
      dataTable: By.css('table'),
      tableRows: By.css('table tbody tr'),
      tableHeaders: By.css('table thead th'),
      
      // Filter Bar (if exists)
      filterBar: By.css('[class*="filter"]'),
      
      // Loading states
      loadingSpinners: By.css('[class*="animate-pulse"]')
    };
  }

  /**
   * Navigate to Cost & Tokens page
   */
  async navigate() {
    await this.driver.get(`${this.baseUrl}/dashboard/cost`);
    await waitForPageLoad(this.driver);
    await waitForApiCalls(this.driver, 15000);
  }

  /**
   * Wait for all KPI cards to load
   */
  async waitForKpiCardsToLoad() {
    await waitForElement(this.driver, this.locators.kpiCards);
    // Wait for loading spinners to disappear
    await this.driver.sleep(2000);
  }

  /**
   * Get KPI card value by title
   */
  async getKpiValue(title) {
    const locator = By.xpath(`//p[contains(text(), "${title}")]/parent::div/following-sibling::p`);
    return await getTextContent(this.driver, locator);
  }

  /**
   * Get all KPI card values
   */
  async getAllKpiValues() {
    await this.waitForKpiCardsToLoad();
    
    return {
      totalCost: await this.getKpiValue('Total Cost'),
      avgCostPerUser: await this.getKpiValue('Average Cost per User'),
      totalTokens: await this.getKpiValue('Total Tokens'),
      costPer1MTokens: await this.getKpiValue('Cost per 1M Tokens'),
      avgCostPerRequest: await this.getKpiValue('Avg Cost per Request'),
      costPerUserDay: await this.getKpiValue('Cost per User-Day')
    };
  }

  /**
   * Check if KPI cards have icons
   */
  async hasKpiIcons() {
    const icons = await getAllElements(this.driver, this.locators.kpiIcons);
    return icons.length >= 6; // Should have 6 icons for 6 KPI cards
  }

  /**
   * Get KPI icons
   */
  async getKpiIcons() {
    const icons = await getAllElements(this.driver, this.locators.kpiIcons);
    const iconTexts = [];
    for (const icon of icons) {
      const text = await icon.getText();
      iconTexts.push(text);
    }
    return iconTexts;
  }

  /**
   * Check if warning banner is displayed
   */
  async hasWarningBanner() {
    return await elementExists(this.driver, this.locators.warningBanner, 3000);
  }

  /**
   * Get warning banner message
   */
  async getWarningMessage() {
    if (await this.hasWarningBanner()) {
      return await getTextContent(this.driver, this.locators.warningMessage);
    }
    return null;
  }

  /**
   * Wait for all charts to load
   */
  async waitForChartsToLoad() {
    await waitForChartsToLoad(this.driver, 20000);
  }

  /**
   * Check if chart exists by title
   */
  async hasChart(title) {
    const locator = By.xpath(`//h3[contains(text(), "${title}")]`);
    return await elementExists(this.driver, locator, 5000);
  }

  /**
   * Get count of all charts on page
   */
  async getChartCount() {
    const canvasElements = await getAllElements(this.driver, By.css('canvas'));
    return canvasElements.length;
  }

  /**
   * Check if specific charts exist
   */
  async verifyAllChartsExist() {
    await this.waitForChartsToLoad();
    
    return {
      dailyCostTrend: await this.hasChart('Daily Cost Trend'),
      vendorCostTrend: await this.hasChart('Vendor Cost Trend'),
      costUsageAnalysis: await this.hasChart('Cost vs Usage Analysis'),
      costByModel: await this.hasChart('Cost by Model'),
      tokenDistribution: await this.hasChart('Token Distribution'),
      topUsers: await this.hasChart('Top 10 Users')
    };
  }

  /**
   * Scroll to chart by title
   */
  async scrollToChart(title) {
    const locator = By.xpath(`//h3[contains(text(), "${title}")]/ancestor::div[contains(@class, "bg-white")]`);
    const element = await waitForElement(this.driver, locator);
    await scrollToElement(this.driver, element);
  }

  /**
   * Get table row count
   */
  async getTableRowCount() {
    const rows = await getAllElements(this.driver, this.locators.tableRows);
    return rows.length;
  }

  /**
   * Get table headers
   */
  async getTableHeaders() {
    const headers = await getAllElements(this.driver, this.locators.tableHeaders);
    const headerTexts = [];
    for (const header of headers) {
      const text = await header.getText();
      headerTexts.push(text);
    }
    return headerTexts;
  }

  /**
   * Check if table exists
   */
  async hasTable() {
    return await elementExists(this.driver, this.locators.dataTable, 5000);
  }

  /**
   * Take a screenshot of the entire page
   */
  async takeFullPageScreenshot(filename) {
    const image = await this.driver.takeScreenshot();
    const fs = require('fs');
    const path = require('path');
    const screenshotDir = process.env.SCREENSHOT_DIR || './screenshots';
    
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const filepath = path.join(screenshotDir, filename);
    fs.writeFileSync(filepath, image, 'base64');
    console.log(`Screenshot saved: ${filepath}`);
  }

  /**
   * Get page title
   */
  async getPageTitle() {
    return await this.driver.getTitle();
  }

  /**
   * Verify page loaded successfully
   */
  async verifyPageLoaded() {
    await waitForPageLoad(this.driver);
    const title = await this.getPageTitle();
    return title.includes('Analytics') || title.includes('Cost');
  }

  /**
   * Get all visible text on page (for debugging)
   */
  async getPageText() {
    const bodyElement = await this.driver.findElement(By.css('body'));
    return await bodyElement.getText();
  }
}

module.exports = CostPage;
