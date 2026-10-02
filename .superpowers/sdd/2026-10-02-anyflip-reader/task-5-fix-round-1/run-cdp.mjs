import fs from "node:fs/promises";
import path from "node:path";

const base = "http://127.0.0.1:4318";
const outDir = path.dirname(new URL(import.meta.url).pathname);
const target = await fetch("http://127.0.0.1:9334/json/new?about:blank", { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  ws.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
const waitFor = async (expression, timeout = 20000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
};
const rectScript = `(element) => { const r = element?.getBoundingClientRect(); return r && ({x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}); }`;
const metrics = async (label) => evaluate(`(() => {
  const rect = ${rectScript};
  const stage = document.querySelector('.book-stage');
  const book = document.querySelector('.flip-book');
  const controls = document.querySelector('.reader-controls');
  const pages = [...document.querySelectorAll('.book-page')].filter((el) => { const r=el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }).map((el) => ({number:el.textContent.trim().match(/\\d+/)?.[0], rect:rect(el)}));
  const sr = rect(stage), br = rect(book), cr = rect(controls);
  const next = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Next');
  const nr = rect(next);
  const hit = nr && document.elementFromPoint(nr.x + nr.width / 2, nr.y + nr.height / 2);
  return {
    label:${JSON.stringify(label)}, url:location.href, viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
    media:{portrait:matchMedia('(orientation: portrait)').matches, coarse:matchMedia('(pointer: coarse)').matches, noHover:matchMedia('(hover: none)').matches},
    document:{htmlScrollWidth:document.documentElement.scrollWidth,htmlScrollHeight:document.documentElement.scrollHeight,bodyScrollWidth:document.body.scrollWidth,bodyScrollHeight:document.body.scrollHeight,horizontalOverflow:document.documentElement.scrollWidth > innerWidth,verticalOverflow:document.documentElement.scrollHeight > innerHeight},
    computedTransform:getComputedStyle(book).transform, wrapperClass:book?.querySelector('.stf__wrapper')?.className,
    rects:{stage:sr,book:br,pages,controls:cr,nextButton:nr},
    clipping:{bookBottomWithinStage:br.bottom <= sr.bottom + 0.5,pagesWithinStage:pages.every(({rect:r}) => r.bottom <= sr.bottom + 0.5),controlsBelowStage:cr.y >= sr.bottom - 0.5},
    pointerHit:{point:nr && {x:nr.x+nr.width/2,y:nr.y+nr.height/2},tag:hit?.tagName,text:hit?.textContent.trim()},
    status:document.querySelector('.page-status')?.textContent.trim()
  };
})()`);

await send("Page.enable");
await send("Runtime.enable");
const results = {};
async function configure({ label, width, height, mobile, touch, orientation, page = 37 }) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenOrientation:{type:orientation === 'portrait' ? 'portraitPrimary' : 'landscapePrimary', angle:orientation === 'portrait' ? 0 : 90} });
  await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
  await send("Emulation.setEmitTouchEventsForMouse", { enabled: false });
  await send("Emulation.setUserAgentOverride", { userAgent: mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36", platform: mobile ? "iPhone" : "MacIntel" });
  await send("Page.navigate", { url:`${base}/read/iehyo/byxp?page=${page}` });
  await waitFor(`document.querySelector('.page-status')?.textContent.includes('of 324')`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  results[label] = await metrics(label);
  const shot = await send("Page.captureScreenshot", { format:"png", captureBeyondViewport:false, fromSurface:true });
  await fs.writeFile(path.join(outDir, `${label}.png`), Buffer.from(shot.data, "base64"));
}

await configure({label:"landscape-480x320",width:480,height:320,mobile:true,touch:true,orientation:"landscape",page:36});
const hit = results["landscape-480x320"].pointerHit.point;
const beforeClick = results["landscape-480x320"].status;
await send("Input.dispatchMouseEvent", {type:"mousePressed",x:hit.x,y:hit.y,button:"left",clickCount:1});
await send("Input.dispatchMouseEvent", {type:"mouseReleased",x:hit.x,y:hit.y,button:"left",clickCount:1});
await waitFor(`document.querySelector('.page-status')?.textContent.trim() !== ${JSON.stringify(beforeClick)}`);
results["landscape-480x320"].pointerClick = {before:beforeClick,after:await evaluate(`document.querySelector('.page-status').textContent.trim()`)};

await configure({label:"portrait-320x568",width:320,height:568,mobile:true,touch:true,orientation:"portrait"});
const p = results["portrait-320x568"].rects.pages[0].rect;
const y = p.y + p.height / 2;
const swipeBefore = results["portrait-320x568"].status;
await send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x:p.right-25,y}]});
for (const x of [p.right-65,p.right-105,p.right-145]) await send("Input.dispatchTouchEvent", {type:"touchMove",touchPoints:[{x,y}]});
await send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
await waitFor(`document.querySelector('.page-status')?.textContent.trim() !== ${JSON.stringify(swipeBefore)}`);
results["portrait-320x568"].swipe = {direction:"left",before:swipeBefore,after:await evaluate(`document.querySelector('.page-status').textContent.trim()`),url:await evaluate(`location.href`)};

await configure({label:"portrait-390x844",width:390,height:844,mobile:true,touch:true,orientation:"portrait"});
await configure({label:"desktop-1440x900",width:1440,height:900,mobile:false,touch:false,orientation:"landscape",page:36});
await configure({label:"desktop-short-1024x400",width:1024,height:400,mobile:false,touch:false,orientation:"landscape",page:36});
await fs.writeFile(path.join(outDir, "browser-evidence.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
ws.close();
