import { APP_VERSION } from "@/lib/appVersion";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: APP_VERSION },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } }
  );
}
