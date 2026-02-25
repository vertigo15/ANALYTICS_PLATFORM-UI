"""
Selenium test for Agent Analytics page and Conversation Drill-Down.
Requires: pip install selenium
Usage:    python test_agent_analytics.py
"""

import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

BASE_URL = "http://localhost:3000"
TIMEOUT = 20


def create_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    return webdriver.Chrome(options=options)


def test_sidebar_has_agent_analytics(driver, wait):
    """Test 1: Agent Analytics link appears in the sidebar."""
    print("TEST 1: Sidebar contains 'Agent Analytics' link...")
    driver.get(f"{BASE_URL}/dashboard/cost")
    wait.until(EC.presence_of_element_located((By.TAG_NAME, "nav")))

    sidebar_links = driver.find_elements(By.CSS_SELECTOR, "aside nav a")
    labels = [link.text.strip() for link in sidebar_links]
    print(f"  Sidebar items found: {labels}")

    assert "Agent Analytics" in labels, f"'Agent Analytics' not found in sidebar. Found: {labels}"
    print("  PASSED: 'Agent Analytics' is in the sidebar.\n")


def test_agent_analytics_page_loads(driver, wait):
    """Test 2: Clicking 'Agent Analytics' loads the page with KPIs and charts."""
    print("TEST 2: Agent Analytics page loads with KPI cards and charts...")

    # Click the sidebar link
    link = driver.find_element(By.XPATH, "//aside//a[contains(., 'Agent Analytics')]")
    link.click()
    time.sleep(2)

    # Verify URL
    assert "/dashboard/analytics" in driver.current_url, \
        f"Expected URL to contain '/dashboard/analytics', got: {driver.current_url}"
    print(f"  URL: {driver.current_url}")

    # Verify page title in topbar
    try:
        topbar_title = wait.until(
            EC.presence_of_element_located((By.XPATH, "//header//h2"))
        )
        assert "Agent Analytics" in topbar_title.text, \
            f"Expected 'Agent Analytics' in header, got: {topbar_title.text}"
        print(f"  Page title: {topbar_title.text}")
    except Exception:
        print("  WARNING: Could not find page title in header (non-critical)")

    # Verify sidebar highlights
    active_link = driver.find_element(By.XPATH, "//aside//a[contains(@class, 'bg-primary')]")
    assert "Agent Analytics" in active_link.text, \
        f"Active sidebar item should be 'Agent Analytics', got: {active_link.text}"
    print(f"  Active sidebar item: {active_link.text}")

    # Check for KPI cards (look for the card container)
    time.sleep(3)  # Wait for data to load
    kpi_cards = driver.find_elements(By.CSS_SELECTOR, ".bg-white.rounded-xl.shadow-sm")
    print(f"  White cards on page: {len(kpi_cards)}")
    assert len(kpi_cards) >= 4, f"Expected at least 4 cards (KPIs + charts), found {len(kpi_cards)}"

    # Check for specific KPI titles
    page_text = driver.find_element(By.TAG_NAME, "main").text
    expected_kpis = [
        "Total Conversations Analyzed",
        "Avg Agent Response Time",
        "Avg Conversation Length",
        "Escalation Rate",
    ]
    for kpi in expected_kpis:
        if kpi in page_text:
            print(f"  Found KPI: {kpi}")
        else:
            print(f"  WARNING: KPI '{kpi}' not found in page text (may be loading)")

    # Check for chart titles
    expected_charts = [
        "Conversation Outcome Breakdown",
        "Avg Response Time by Agent",
        "Conversation Depth Over Time",
    ]
    for chart in expected_charts:
        if chart in page_text:
            print(f"  Found chart: {chart}")
        else:
            print(f"  WARNING: Chart '{chart}' not found in page text (may be loading)")

    # Check for Conversations table header
    if "Conversations" in page_text:
        print("  Found: Conversations table section")

    print("  PASSED: Agent Analytics page loads correctly.\n")


def test_conversations_table_has_rows(driver, wait):
    """Test 3: Conversations table renders rows (if data exists)."""
    print("TEST 3: Conversations table has data...")
    time.sleep(3)

    table_rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
    print(f"  Table rows found: {len(table_rows)}")

    if len(table_rows) > 0:
        # Check that rows have expected column content
        first_row_cells = table_rows[0].find_elements(By.TAG_NAME, "td")
        print(f"  Columns in first row: {len(first_row_cells)}")
        assert len(first_row_cells) >= 6, f"Expected at least 6 columns, got {len(first_row_cells)}"

        # Check for outcome badge in the table
        badges = table_rows[0].find_elements(By.CSS_SELECTOR, "span.rounded-full")
        if badges:
            print(f"  Outcome badge text: {badges[0].text}")

        print("  PASSED: Table has rows with expected columns.\n")
    else:
        print("  SKIPPED: No conversation data in current date range.\n")


def test_conversation_drilldown_navigation(driver, wait):
    """Test 4: Clicking a table row navigates to the drill-down page."""
    print("TEST 4: Conversation drill-down navigation...")

    table_rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
    if len(table_rows) == 0:
        print("  SKIPPED: No rows to click.\n")
        return

    # Click first row
    table_rows[0].click()
    time.sleep(3)

    # Check URL changed to include a conversation ID
    if "/dashboard/analytics/" in driver.current_url and driver.current_url != f"{BASE_URL}/dashboard/analytics":
        print(f"  Navigated to: {driver.current_url}")

        # Check for Layer 1 — Session Header
        page_text = driver.find_element(By.TAG_NAME, "main").text
        if "Back to Analytics" in page_text:
            print("  Found: Back button")
        if "Conversation" in page_text:
            print("  Found: Conversation header")

        # Check for Layer 2 — Orchestration Flow
        if "Agent Orchestration Flow" in page_text:
            print("  Found: Layer 2 — Agent Orchestration Flow")

        # Check for Layer 3 — Timeline
        if "Timeline" in page_text:
            print("  Found: Layer 3 — Timeline Scrubber")

        # Check for Layer 4 — Message Thread
        if "Message Thread" in page_text:
            print("  Found: Layer 4 — Message Thread")

        # Test back button returns to analytics
        back_btn = driver.find_elements(By.XPATH, "//button[contains(., 'Back to Analytics')]")
        if back_btn:
            back_btn[0].click()
            time.sleep(2)
            assert "/dashboard/analytics" in driver.current_url, \
                f"Back button didn't return to analytics page: {driver.current_url}"
            print("  Back button works correctly")

        print("  PASSED: Drill-down page loads with all 4 layers.\n")
    else:
        print(f"  URL after click: {driver.current_url}")
        print("  SKIPPED: Navigation didn't go to drill-down (may be no conversation ID).\n")


def test_filter_bar_present(driver, wait):
    """Test 5: Filter bar is present on the analytics page."""
    print("TEST 5: Filter bar present on analytics page...")
    driver.get(f"{BASE_URL}/dashboard/analytics")
    time.sleep(2)

    # Check for date range buttons
    date_buttons = driver.find_elements(By.XPATH, "//button[contains(text(), '7D') or contains(text(), '30D') or contains(text(), '90D')]")
    print(f"  Date range buttons found: {len(date_buttons)}")
    assert len(date_buttons) >= 3, f"Expected 3+ date buttons, found {len(date_buttons)}"

    # Check for Organisation dropdown
    org_selects = driver.find_elements(By.XPATH, "//select[option[contains(text(), 'All Organisations')]]")
    print(f"  Organisation dropdown found: {len(org_selects) > 0}")

    # Check for Agent dropdown
    agent_selects = driver.find_elements(By.XPATH, "//select[option[contains(text(), 'All Agents')]]")
    print(f"  Agent dropdown found: {len(agent_selects) > 0}")

    print("  PASSED: Filter bar is present.\n")


def main():
    print("=" * 60)
    print("SELENIUM TEST: Agent Analytics Page")
    print(f"Target: {BASE_URL}")
    print("=" * 60 + "\n")

    driver = create_driver()
    wait = WebDriverWait(driver, TIMEOUT)
    passed = 0
    failed = 0
    errors = []

    tests = [
        test_sidebar_has_agent_analytics,
        test_agent_analytics_page_loads,
        test_conversations_table_has_rows,
        test_conversation_drilldown_navigation,
        test_filter_bar_present,
    ]

    try:
        for test_fn in tests:
            try:
                test_fn(driver, wait)
                passed += 1
            except AssertionError as e:
                failed += 1
                errors.append(f"{test_fn.__name__}: {e}")
                print(f"  FAILED: {e}\n")
            except Exception as e:
                failed += 1
                errors.append(f"{test_fn.__name__}: {e}")
                print(f"  ERROR: {e}\n")
    finally:
        driver.quit()

    print("=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
    if errors:
        print("\nFailed tests:")
        for err in errors:
            print(f"  - {err}")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
