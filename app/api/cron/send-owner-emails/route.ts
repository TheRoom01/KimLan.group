import {
  GET as dispatchOwnerEmails,
  POST as dispatchOwnerEmailsPost,
} from "../owner-email-outbox/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return dispatchOwnerEmails(request);
}

export async function POST(request: Request) {
  return dispatchOwnerEmailsPost(request);
}
