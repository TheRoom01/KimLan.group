import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { defaultShareImage, homeOpenGraph } from "../../lib/default-share-image";
import { buildVipShareUrl } from "../../lib/vipShareUrl";

const vip = "a".repeat(64);
const agents = [
  "facebookexternalhit/1.1", "Facebot", "Zalo/1.0", "ZaloBot/1.0",
  "Mozilla/5.0 (compatible; ZaloBot/1.0)", "Twitterbot/1.0",
  "TelegramBot (like TwitterBot)", "Slackbot-LinkExpanding 1.0",
  "Discordbot/2.0", "WhatsApp/2.0", "Viber/1.0", "LinkedInBot/1.0", "Linepoker/1.0",
];

async function main() {
  for (const origin of ["https://canhodichvu.pro", "https://www.canhodichvu.pro/"]) {
    assert.equal(buildVipShareUrl(origin, vip), `https://www.canhodichvu.pro/?vip=${vip}&preview=2`);
  }
  const local = new URL(buildVipShareUrl("http://localhost:3000", "a&b"));
  assert.equal(local.origin, "http://localhost:3000");
  assert.equal(local.searchParams.get("vip"), "a&b");
  for (const agent of agents) {
    const request = new NextRequest(`https://canhodichvu.pro/?vip=${vip}`, {
      headers: { "user-agent": agent },
    });
    const response = await proxy(request);
    const html = await response.text();
    assert.equal(response.status, 200, agent);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8", agent);
    assert.equal(response.headers.get("set-cookie"), null, agent);
    assert.equal(response.headers.get("vary"), "User-Agent", agent);
    assert.equal(response.headers.get("cache-control"), "private, no-store", agent);
    const head = html.split("</head>")[0];
    assert.ok(head.includes(`property="og:image" content="${defaultShareImage.url}"`), agent);
    assert.ok(head.includes(`property="og:url" content="${homeOpenGraph.url}?vip=${vip}"`), agent);
    assert.ok(head.includes('name="twitter:card" content="summary_large_image"'), agent);
    assert.ok(html.length < 4000, agent);
    const headResponse = await proxy(new NextRequest(request.url, {
      method: "HEAD", headers: { "user-agent": agent },
    }));
    assert.equal(await headResponse.text(), "", agent);
    assert.equal(headResponse.headers.get("content-type"), response.headers.get("content-type"), agent);
  }

  const malicious = new NextRequest('https://canhodichvu.pro/?vip=%22%3E%3Cscript%3E%26x=1', {
    headers: { "user-agent": "Zalo/1.0" },
  });
  const html = await (await proxy(malicious)).text();
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("&x=1"));
  const plain = await (await proxy(new NextRequest("https://canhodichvu.pro/", {
    headers: { "user-agent": "Zalo/1.0" },
  }))).text();
  assert.ok(plain.includes(`property="og:url" content="${homeOpenGraph.url}"`));
  for (const agent of ["Mozilla/5.0 Chrome/130.0", "Mozilla/5.0 Zalo/1.0", "Mozilla/5.0 ZaloPC/1.0", "Mozilla/5.0 WhatsApp/2.0", "Mozilla/5.0 Viber/1.0"]) {
    const response = await proxy(new NextRequest(`https://canhodichvu.pro/?vip=${vip}`, {
      headers: { "user-agent": agent },
    }));
    assert.equal(response.headers.get("x-middleware-next"), "1", agent);
  }
  const room = await proxy(new NextRequest("https://canhodichvu.pro/rooms/example", {
    headers: { "user-agent": "ZaloBot/1.0" },
  }));
  assert.equal(room.headers.get("x-middleware-next"), "1");
  console.log(`VIP share preview: ${agents.length} crawlers, GET/HEAD, URL identity and escaping passed`);
}

void main();
