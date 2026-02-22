const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

/**
 * Create a new WebDriver instance
 */
async function createDriver(headless = process.env.HEADLESS === 'true') {
  const options = new chrome.Options();
  
  if (headless) {
    options.addArguments('--headless');
    options.addArguments('--disable-gpu');
  }
  
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments('--window-size=1920,1080');
  
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
  
  await driver.manage().setTimeouts({
    implicit: parseInt(process.env.TIMEOUT) || 30000,
    pageLoad: parseInt(process.env.TIMEOUT) || 30000,
    script: parseInt(process.env.TIMEOUT) || 30000
  });
  
  return driver;
}

/**
 * Take a screenshot on test failure
 */
async function takeScreenshot(driver, testName) {
  if (process.env.SCREENSHOT_ON_FAILURE === 'true') {
    try {
      const screenshotDir = process.env.SCREENSHOT_DIR || './screenshots';
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${testName}_${timestamp}.png`;
      const filepath = path.join(screenshotDir, filename);
      
      const image = await driver.takeScreenshot();
      fs.writeFileSync(filepath, image, 'base64');
      console.log(`Screenshot saved: ${filepath}`);
    } catch (error) {
      console.error('Failed to take screenshot:', error);
    }
  }
}

/**
 * Wait for element to be visible
 */
async function waitForElement(driver, locator, timeout = 10000) {
  return await driver.wait(until.elementLocated(locator), timeout);
}

/**
 * Wait for element to be visible and clickable
 */
async function waitForClickable(driver, locator, timeout = 10000) {
  const element = await waitForElement(driver, locator, timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  await driver.wait(until.elementIsEnabled(element), timeout);
  return element;
}

/**
 * Wait for page to load completely
 */
async function waitForPageLoad(driver, timeout = 30000) {
  await driver.wait(async () => {
    const readyState = await driver.executeScript('return document.readyState');
    return readyState === 'complete';
  }, timeout);
}

/**
 * Wait for API calls to complete
 */
async function waitForApiCalls(driver, timeout = 10000) {
  await driver.wait(async () => {
    const pendingRequests = await driver.executeScript(
      'return window.performance.getEntriesByType("resource").filter(r => r.initiatorType === "fetch" && !r.responseEnd).length'
    );
    return pendingRequests === 0;
  }, timeout);
}

/**
 * Scroll element into view
 */
async function scrollToElement(driver, element) {
  await driver.executeScript('arguments[0].scrollIntoView({behavior: "smooth", block: "center"});', element);
  await driver.sleep(500); // Wait for smooth scroll
}

/**
 * Get text content of element
 */
async function getTextContent(driver, locator) {
  const element = await waitForElement(driver, locator);
  return await element.getText();
}

/**
 * Check if element exists
 */
async function elementExists(driver, locator, timeout = 5000) {
  try {
    await driver.wait(until.elementLocated(locator), timeout);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get element attribute
 */
async function getAttribute(driver, locator, attribute) {
  const element = await waitForElement(driver, locator);
  return await element.getAttribute(attribute);
}

/**
 * Click element with retry
 */
async function clickElement(driver, locator, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const element = await waitForClickable(driver, locator);
      await element.click();
      return;
    } catch (error) {
      lastError = error;
      await driver.sleep(1000);
    }
  }
  throw lastError;
}

/**
 * Wait for text to appear in element
 */
async function waitForTextInElement(driver, locator, text, timeout = 10000) {
  await driver.wait(async () => {
    try {
      const element = await driver.findElement(locator);
      const elementText = await element.getText();
      return elementText.includes(text);
    } catch (error) {
      return false;
    }
  }, timeout);
}

/**
 * Get all elements matching locator
 */
async function getAllElements(driver, locator) {
  await waitForElement(driver, locator);
  return await driver.findElements(locator);
}

/**
 * Wait for charts to load (checks for canvas elements)
 */
async function waitForChartsToLoad(driver, timeout = 15000) {
  await driver.wait(async () => {
    const canvasElements = await driver.findElements(By.css('canvas'));
    return canvasElements.length > 0;
  }, timeout);
  
  // Additional wait for chart rendering
  await driver.sleep(2000);
}

module.exports = {
  createDriver,
  takeScreenshot,
  waitForElement,
  waitForClickable,
  waitForPageLoad,
  waitForApiCalls,
  scrollToElement,
  getTextContent,
  elementExists,
  getAttribute,
  clickElement,
  waitForTextInElement,
  getAllElements,
  waitForChartsToLoad
};
