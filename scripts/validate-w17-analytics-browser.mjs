import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// Real RYTHM component and client event functions; synthetic navigation,
// provider script and API transport. Every browser request is intercepted.
// No production traffic, provider call, credential or database write.
const bundle = await build({
  stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import Consent from "./components/analytics/GoogleAnalyticsConsent";
    import { trackPublicExperienceEvent, writePublicAttribution } from "./lib/analytics/public-events";
    import Referral from "./app/(public)/_components/PublicReferralObserver";
    function Fixture() {
      return <><h1>Essential fixture</h1><button onClick={() => {
        writePublicAttribution({kind:"organic",source:"google",landing_path:"/cookies",referrer_host:"google.com"});
        trackPublicExperienceEvent({name:"tour_started"});
      }}>Emit test event</button><Consent/><Referral/></>;
    }
    createRoot(document.getElementById("root")).render(<Fixture/>);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, jsx: "automatic", format: "iife",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixture-navigation", setup(b) {
    b.onResolve({filter:/^next\/navigation$/},()=>({path:"navigation",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:"export const usePathname = () => window.location.pathname;"}));
  }}],
});
const origin = "https://rythm-os.com";
const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const browser = await chromium.launch({headless:true,channel:process.env.CRM_BROWSER_CHANNEL||undefined});
try {
  const context = await browser.newContext({serviceWorkers:"block"});
  const calls = {ga:0, api:0, unexpected:0};
  const errors = [];
  await context.route("**/*", async route => {
    const u = new URL(route.request().url());
    if (u.origin === origin && u.pathname === "/cookies") return route.fulfill({status:200,contentType:"text/html",body:html});
    if (u.origin === origin && u.pathname === "/fixture.js") return route.fulfill({status:200,contentType:"application/javascript",body:bundle.outputFiles[0].text});
    if (u.origin === origin && u.pathname === "/api/analytics/public-events") {calls.api++;return route.fulfill({status:204});}
    if (u.hostname === "www.googletagmanager.com" && u.pathname === "/gtag/js") {
      calls.ga++;
      return route.fulfill({status:200,contentType:"application/javascript",body:'document.cookie="_ga=synthetic; Path=/; Secure";'});
    }
    if(u.origin===origin&&u.pathname==="/favicon.ico") return route.fulfill({status:204});
    calls.unexpected++;return route.abort();
  });
  const makePage = async () => {const p=await context.newPage();p.on("pageerror", e=>errors.push(e.message));return p;};
  const page=await makePage();
  const go=async p=>{await p.goto(origin+"/cookies");await p.getByRole("heading",{name:"Essential fixture"}).waitFor();};
  const cookie=async(name)=>(await context.cookies(origin)).find(c=>c.name===name)?.value;
  const emit=async p=>{await p.getByRole("button",{name:"Emit test event",exact:true}).click();};
  const prefs=p=>p.getByRole("button",{name:"Manage analytics preferences",exact:true});
  const banner=p=>p.getByRole("complementary",{name:"Analytics consent"});
  const settle=()=>new Promise(r=>setTimeout(r,400));
  await context.addCookies([{name:"rythm_analytics_consent",value:"granted",url:origin},{name:"_ga",value:"legacy",url:origin}]);
  await go(page);await banner(page).waitFor();
  await emit(page);await settle();
  assert.equal(calls.ga,0);assert.equal(calls.api,0);
  assert.equal(await cookie("_ga"),undefined);assert.equal(await cookie("rythm_public_attribution"),undefined);
  await Promise.all([page.waitForEvent("load"),page.getByRole("button",{name:"Decline",exact:true}).click()]);
  await prefs(page).waitFor();await emit(page);await settle();
  assert.equal(calls.ga,0);assert.equal(calls.api,0);
  assert.equal(await cookie("rythm_analytics_consent_v2"),"denied");
  await prefs(page).click();
  await Promise.all([page.waitForEvent("load"),page.getByRole("button",{name:"Accept analytics",exact:true}).click()]);
  await prefs(page).waitFor();await page.waitForFunction(()=>document.cookie.includes("_ga=synthetic"));
  assert.equal(await cookie("rythm_analytics_consent_v2"),"granted");assert.equal(calls.ga,1);
  const before=calls.api;await emit(page);await settle();assert.equal(calls.api,before+1);
  assert.ok(await cookie("rythm_public_attribution"));
  const second=await makePage();await go(second);await prefs(second).waitFor();await second.waitForFunction(()=>!!document.querySelector("script[data-rythm-ga4]"));
  await prefs(page).click();
  await Promise.all([page.waitForEvent("load"),page.getByRole("button",{name:"Decline",exact:true}).click()]);
  await prefs(page).waitFor();
  await second.waitForFunction(()=>!document.querySelector("script[data-rythm-ga4]"),{},{timeout:15000});
  const after={...calls};await emit(page);await emit(second);await settle();
  assert.equal(calls.ga,after.ga);assert.equal(calls.api,after.api);
  assert.equal(await cookie("_ga"),undefined);assert.equal(await cookie("rythm_public_attribution"),undefined);
  assert.equal(await second.evaluate(()=>sessionStorage.getItem("rythm:public-attribution")),null);
  assert.equal(calls.unexpected,0);assert.deepEqual(errors,[]);
  console.log("W17 browser component PASS: legacy consent rejected, refusal, opt-in, known-cookie cleanup, same-host second-tab withdrawal, client transport guards; all provider and API requests intercepted.");
  await context.close();
} finally { await browser.close(); }
