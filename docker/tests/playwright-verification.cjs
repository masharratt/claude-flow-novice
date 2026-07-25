// Final verification that Playwright module loading is completely fixed
const { chromium } = require('playwright');

console.log('🔍 Playwright Module Loading Verification');
console.log('=====================================');

try {
    // Test 1: Verify Playwright module loads
    console.log('✅ Playwright module loaded successfully');

    // Test 2: Check Playwright version
    const packageInfo = require('playwright/package.json');
    console.log(`✅ Playwright version: ${packageInfo.version}`);

    // Test 3: Verify browser launch
    (async () => {
        console.log('🚀 Testing browser launch...');
        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('✅ Browser launched successfully');

        // Test 4: Create page and navigate
        const page = await browser.newPage();
        await page.goto('https://example.com');
        console.log('✅ Page navigation successful');

        // Test 5: Take screenshot
        await page.screenshot({ path: '/app/screenshots/verification.png' });
        console.log('✅ Screenshot saved to /app/screenshots/verification.png');

        // Test 6: Get page title
        const title = await page.title();
        console.log(`✅ Page title: "${title}"`);

        await browser.close();
        console.log('✅ Browser closed successfully');

        console.log('\n🎉 ALL TESTS PASSED!');
        console.log('📋 Summary:');
        console.log('   - Playwright module resolution: ✅ FIXED');
        console.log('   - Browser automation: ✅ WORKING');
        console.log('   - Screenshot functionality: ✅ WORKING');
        console.log('   - Page navigation: ✅ WORKING');
        console.log('\n🐳 Docker image: claude-flow-novice:playwright-working');
        console.log('🔧 Fix applied: NODE_PATH=/usr/local/lib/node_modules');

    })().catch(console.error);

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}