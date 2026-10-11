import { paymentWebhook } from "@/server/integrations";
export async function POST(request: Request) {
  try {
    return Response.json(await paymentWebhook(request));
  } catch {
    return Response.json(
      {
        error: {
          code: "WEBHOOK_REJECTED",
          message: "Payment notification could not be verified.",
        },
      },
      { status: 400 },
    );
  }
}
