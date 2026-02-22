from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import json

# Setup Chrome options
chrome_options = Options()
chrome_options.add_argument('--headless')
chrome_options.add_argument('--no-sandbox')
chrome_options.add_argument('--disable-dev-shm-usage')
chrome_options.add_argument('--disable-gpu')
chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL', 'performance': 'ALL'})

# Create driver
driver = webdriver.Chrome(options=chrome_options)

try:
    print("=" * 80)
    print("Testing Documents Dashboard")
    print("=" * 80)
    
    # Navigate to documents page
    url = "http://localhost:3000/dashboard/documents"
    print(f"\nNavigating to: {url}")
    driver.get(url)
    
    # Wait a moment for page to load
    time.sleep(3)
    
    print(f"\nPage Title: {driver.title}")
    print(f"Current URL: {driver.current_url}")
    
    # Check for error messages in page
    page_source = driver.page_source
    if "404" in page_source:
        print("\n⚠️  WARNING: Found '404' in page source")
    if "error" in page_source.lower():
        print("\n⚠️  WARNING: Found 'error' in page source")
    
    # Get browser console logs
    print("\n" + "=" * 80)
    print("Browser Console Logs:")
    print("=" * 80)
    logs = driver.get_log('browser')
    for log in logs[-20:]:  # Last 20 logs
        level = log['level']
        message = log['message']
        if level in ['SEVERE', 'WARNING']:
            print(f"[{level}] {message}")
    
    # Get network logs
    print("\n" + "=" * 80)
    print("API Network Requests:")
    print("=" * 80)
    
    perf_logs = driver.get_log('performance')
    for log in perf_logs:
        try:
            log_data = json.loads(log['message'])
            message = log_data.get('message', {})
            method = message.get('method', '')
            
            if method == 'Network.responseReceived':
                params = message.get('params', {})
                response = params.get('response', {})
                url = response.get('url', '')
                status = response.get('status', 0)
                
                # Only show API calls
                if '/api/v1/' in url:
                    status_icon = "✅" if status == 200 else "❌"
                    print(f"{status_icon} [{status}] {url}")
        except:
            pass
    
    # Check if any content loaded
    print("\n" + "=" * 80)
    print("Page Content Check:")
    print("=" * 80)
    
    try:
        body = driver.find_element(By.TAG_NAME, 'body')
        body_text = body.text
        
        # Check for key KPIs
        print("\nKPI Values Found:")
        if "Total Documents" in body_text:
            print("  ✅ Total Documents KPI present")
        if "Success Rate" in body_text:
            print("  ✅ Success Rate KPI present")
        if "Avg Chunks/Doc" in body_text:
            print("  ✅ Avg Chunks/Doc KPI present")
        if "Currently Failing" in body_text:
            print("  ✅ Currently Failing KPI present")
        
        # Check for charts
        print("\nChart Sections Found:")
        if "Processing Funnel" in body_text:
            print("  ✅ Processing Funnel chart present")
        if "Daily Processing Volume" in body_text:
            print("  ✅ Daily Processing Volume chart present")
        if "Success Rate by Technique" in body_text:
            print("  ✅ Success Rate by Technique chart present")
        if "Chunk Size Distribution" in body_text:
            if "No chunking data available yet" in body_text:
                print("  ✅ Chunk Size Distribution - showing 'no data' message")
            else:
                print("  ✅ Chunk Size Distribution - has data")
        
        if "Application error" in body_text or "client-side exception" in body_text:
            print("\n❌ ERROR: Page shows application error")
        elif "404" in body_text or "not found" in body_text.lower():
            print("\n❌ ERROR: Page shows 404 or not found message")
        elif len(body_text.strip()) < 50:
            print("\n⚠️  WARNING: Page body seems empty")
        else:
            print("\n✅ Page loaded successfully with content")
            
    except Exception as e:
        print(f"❌ Error reading page content: {e}")
    
    print("\n" + "=" * 80)
    print("Test Complete")
    print("=" * 80)
    
except Exception as e:
    print(f"\n❌ Test failed with error: {e}")
    import traceback
    traceback.print_exc()
finally:
    driver.quit()
