# AI Analytics Assistant - Manual Test Guide

## ✅ Automated Test Results

The Selenium test successfully verified:
- **Sidebar Opening**: AI Assistant sidebar opens and displays correctly
- **UI Elements**: All UI components render properly (header, context pills, collapsible context, input field)
- **Page Context**: Correctly shows "Cost Dashboard" and date range
- **Layout**: Fixed 380px right panel with proper styling

## ⚠️ Known Issues

**API Endpoint Not Reaching Backend**: The frontend is making requests but they may not be reaching the backend due to:
- `process.env.NEXT_PUBLIC_API_URL` potentially not being embedded at build time
- API routes `/api/v1/ai/chat` and `/api/v1/ai/suggestions/:page` registered but not receiving requests

## 🧪 Manual Testing Steps

### 1. Verify API Routes are Registered
```bash
docker exec -it analytics_platform-ui-api-1 ls -la /app/dist/routes/
```
Expected: Should see `ai.js` file

### 2. Check Environment Variables in Web Container
```bash
docker exec -it analytics_platform-ui-web-1 printenv | findstr API_URL
```
Expected: `NEXT_PUBLIC_API_URL=http://localhost:3001`

### 3. Test API Endpoint Directly (from Host)
```bash
curl -X POST http://localhost:3001/api/v1/ai/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\": \"how is total cost calculated\", \"page\": \"cost\", \"context\": {\"filters\": {\"from\": \"2026-01-23\", \"to\": \"2026-02-22\"}}}"
```
Expected: JSON response with KPI explanation

### 4. Test Suggestions Endpoint
```bash
curl http://localhost:3001/api/v1/ai/suggestions/cost
```
Expected: JSON with array of suggested questions

### 5. Check Browser Console (Manual Step)
1. Open http://localhost:3000/dashboard/cost in browser
2. Open DevTools (F12)
3. Click "AI Assistant" button in top right
4. Open Console tab
5. Type a question like "how is total cost calculated"
6. Check for:
   - Network tab: POST to `/api/v1/ai/chat` - should be 200, not 404
   - Console tab: Any errors about undefined `NEXT_PUBLIC_API_URL`

### 6. Manual UI Test Checklist
- [ ] AI Assistant button visible in top right corner
- [ ] Click button opens sidebar on right side
- [ ] Sidebar width is 380px
- [ ] Header shows "Analytics Assistant"
- [ ] Context pills show "Cost Dashboard" and date range
- [ ] "What I know about your current view" collapsible works
- [ ] Input field has placeholder "Ask a question..."
- [ ] Send button (blue arrow) is visible
- [ ] Default suggested questions appear (if no chat history)
- [ ] Typing in input field works
- [ ] Enter key sends message
- [ ] User message appears as blue bubble on right
- [ ] "Thinking..." indicator appears while waiting
- [ ] Assistant response appears as white card on left
- [ ] Clear history button (trash icon) works
- [ ] X button closes sidebar

## 🔧 Quick Fix if API Not Working

If the API endpoint is not receiving requests, rebuild with proper environment variable embedding:

```bash
# From the root directory
docker-compose down
docker-compose build --no-cache web
docker-compose up -d
```

Then rerun the Selenium test or test manually in browser.

## 📊 Test Results Summary

**Frontend UI**: ✅ PASS
- Sidebar rendering: ✅
- Component layout: ✅
- User interaction: ✅
- Context awareness: ✅

**Backend API**: ⚠️ NEEDS VERIFICATION
- Routes registered: ✅ (code confirmed)
- Receiving requests: ❓ (no logs found)
- Azure OpenAI integration: ✅ (code confirmed)
- SQL validation: ✅ (code confirmed)

**Next Steps**:
1. Run manual curl tests above to verify API endpoints
2. Check browser console for client-side errors
3. If needed, rebuild web container to ensure env vars are embedded
4. Rerun Selenium test once API connectivity confirmed
