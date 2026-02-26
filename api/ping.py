import json

def handler(request):
    # Ultra-light health check - no heavy imports
    body = json.dumps({"ok": True})
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    }
    if request.method == "OPTIONS":
        return (json.dumps({"ok": True}), 204, headers)
    return (body, 200, headers)

