const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testCostPage() {
  // Create screenshots directory if it doesn't exist
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  console.log('🚀 Starting browser...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Listen for console errors (ignore 404 resource errors)
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore 404 resource errors (fonts, icons, etc.)
      if (!text.includes('404') && !text.includes('Not Found')) {
        consoleErrors.push(text);
      }
    }
  });
  
  // Listen for page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.toString());
  });
  
  try {
    console.log('📄 Navigating to cost dashboard...');
    await page.goto('http://localhost:3000/dashboard/cost', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('⏱️  Waiting for content to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check for KPI cards
    const kpiCards = await page.$$('.bg-white.rounded-xl.shadow-sm');
    console.log(`✅ Found ${kpiCards.length} KPI cards`);
    
    // Check for charts (canvas elements)
    const charts = await page.$$('canvas');
    console.log(`✅ Found ${charts.length} charts`);
    
    // Check for page title
    const title = await page.title();
    console.log(`✅ Page title: ${title}`);
    
    // Take a screenshot
    await page.screenshot({ path: './screenshots/cost-page-test.png', fullPage: true });
    console.log('📸 Screenshot saved to ./screenshots/cost-page-test.png');
    
    // Report errors
    if (consoleErrors.length > 0) {
      console.log('\\n❌ Console Errors Found:');
      consoleErrors.forEach(err => console.log(`   - ${err}`));
    } else {
      console.log('\\n✅ No console errors detected');
    }
    
    if (pageErrors.length > 0) {
      console.log('\\n❌ Page Errors Found:');
      pageErrors.forEach(err => console.log(`   - ${err}`));
    } else {
      console.log('✅ No page errors detected');
    }
    
    // Final verdict
    const success = consoleErrors.length === 0 && pageErrors.length === 0 && kpiCards.length >= 6 && charts.length >= 6;
    
    if (success) {
      console.log('\\n🎉 TEST PASSED: Cost dashboard loaded successfully!');
      console.log(`   - ${kpiCards.length} KPI cards`);
      console.log(`   - ${charts.length} charts`);
      console.log(`   - 0 JavaScript errors`);
      process.exit(0);
    } else {
      console.log('\\n❌ TEST FAILED: Issues detected');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\\n❌ Test failed with error:', error.message);
    await page.screenshot({ path: './screenshots/error-screenshot.png' });
    console.log('📸 Error screenshot saved');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testCostPage();
