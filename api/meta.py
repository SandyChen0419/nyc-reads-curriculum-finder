from .shared import json_response, build_meta  # adjust import if needed

def handler(request):
    if request.method == "OPTIONS":
        return json_response({}, status=200)

    # quick debug to prove routing works
    if request.args.get("debug") == "1":
        return json_response({"ok": True, "route": "meta"}, status=200)

    return json_response(build_meta(), status=200)
