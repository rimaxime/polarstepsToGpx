export default {
    async fetch(request) {
        const allowedOrigins = [
            "http://localhost:63342",
            "https://rimaxime.github.io",
        ];

        const origin = request.headers.get("Origin");

        if (allowedOrigins.includes(origin)) {
            if (request.method === "OPTIONS") {
                return new Response(null, {
                    status: 204,
                    headers: {
                        "Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, polarsteps-api-version",
                    },
                });
            }

            try {
                const url = new URL(request.url);
                const target = url.searchParams.get("target");

                if (!target) {
                    return new Response("Missing target parameter", { status: 400 });
                }

                const response = await fetch(target, {
                    headers: {
                        "User-Agent": "PolarstepsToGPX",
                        "polarsteps-api-version": request.headers.get("polarsteps-api-version"),
                    },
                });

                const headers = new Headers(response.headers);
                headers.set("Access-Control-Allow-Origin", origin);
                headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                headers.set("Access-Control-Allow-Headers", "Content-Type, polarsteps-api-version");

                return new Response(response.body, {
                    status: response.status,
                    headers,
                });
            } catch (err) {
                return new Response("Proxy error", { status: 500 });
            }
        } else {
            return new Response("CORS error: Unauthorized origin", { status: 403 });
        }
    }
};
