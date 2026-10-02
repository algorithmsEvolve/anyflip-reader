# Task 5: Real Runtime and Browser Verification

Date: 2026-10-03

## Result

PASS for reviewed 480×320 short touch-landscape defect. Prior PASS was wrong: browser rejected unitless CSS division, leaving page bottoms at y=386.656 while stage ended at y=248.

Runtime verification used Next.js production server `http://127.0.0.1:4318` and real Google Chrome through CDP port `9334`. Mobile viewports used `Emulation.setDeviceMetricsOverride`, touch emulation, mobile user agent, and explicit screen orientation.

## Root cause and fix

Prior rule:

```css
transform: scale(calc((100dvh - 9rem) / 320));
```

Invalid `<length> / <number>` result for `scale()`. Chrome computed identity transform; prior evidence recorded unchanged 320px book height and clipping.

Minimal fix uses native PageFlip sizing instead of transform:

```css
@media (max-height: 464px) and (orientation: landscape) and (hover: none) and (pointer: coarse) {
  .flip-book {
    height: calc(100dvh - 9rem) !important;
    min-height: 0 !important;
  }
}
```

Touch/pointer conditions exclude short desktop. At 480×320, available book height is `320 - 144 = 176px`; PageFlip reflows pages to that exact height.

## TDD and gates

Regression invariant changed before CSS. RED: expected scoped native height/min-height rule, got no match. GREEN after CSS change.

| Gate | Result |
|---|---|
| `npm test -- --test-name-pattern='keeps portrait and narrow landscape'` | PASS |
| `npm test` | PASS: 41/41 |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS, Next.js 16.3.8 |

Test now checks spread thresholds, 176px available-height arithmetic, touch-landscape scope, native height override, zero min-height override, and absence of transform in matched rule. Runtime geometry remains authoritative.

## Fresh CDP evidence

Directory: `.superpowers/sdd/2026-10-02-anyflip-reader/task-5-fix-round-1/`

- `browser-evidence.json`: exact metrics and interaction results
- `run-cdp.mjs`: repeatable CDP capture script
- `landscape-480x320.png`
- `portrait-320x568.png`
- `portrait-390x844.png`
- `desktop-1440x900.png`
- `desktop-short-1024x400.png`

### Reviewed defect: 480×320 touch landscape

Before, from prior JSON:

- stage: `{x:16,y:72,width:463.875,height:176,right:479.875,bottom:248}`
- book: `{x:16,y:72,width:463.875,height:320,right:479.875,bottom:392}`
- pages: bottoms `386.65625`
- computed result inferred by geometry; prior capture omitted computed transform

After, fresh CDP:

- computed transform: `matrix(1, 0, 0, 1, 0, 0)`; no transform required
- stage: `{x:16,y:72,width:463.875,height:176,right:479.875,bottom:248}`
- book: `{x:16,y:72,width:463.875,height:176,right:479.875,bottom:248}`
- page 36: `{x:116,y:72,width:132,height:176,right:248,bottom:248}`
- page 37: `{x:248,y:72,width:132,height:176,right:380,bottom:248}`
- controls: `{x:16,y:248,width:463.875,height:56,right:479.875,bottom:304}`
- Next: `{x:415.1875,y:260,width:64.6875,height:44,right:479.875,bottom:304}`
- assertions: book bottom within stage `true`; every visible page bottom within stage `true`; controls below stage `true`
- document: scroll 480×320; horizontal overflow `false`; vertical overflow `false`
- `elementFromPoint(447.53125,282)`: `BUTTON`, `Next`
- CDP pointer click: `36 of 324` to `38 of 324`
- mode: `--landscape`; coarse pointer `true`; hover none `true`

### Portrait 320×568

- stage: `{x:12,y:72,width:296,height:346,right:308,bottom:418}`
- book: `{x:12,y:47.671875,width:296,height:394.65625,right:308,bottom:442.328125}`
- page 37: `{x:12,y:47.828125,width:296,height:394.65625,right:308,bottom:442.484375}`
- controls: `{x:12,y:418,width:296,height:134,right:308,bottom:552}`
- transform: identity; scroll 320×568; no document overflow
- direct CDP left swipe: `37 of 324` to `38 of 324`; URL became `?page=38`
- Truthful note: centered book extends 24.484px below stage and is clipped there. This behavior predates reviewed landscape fix; controls remain clickable and direct swipe passes.

### Portrait 390×844

- stage: `{x:12,y:72,width:366,height:622,right:378,bottom:694}`
- book/page 37: `{x:12,y:139,width:366,height:488,right:378,bottom:627}`
- controls: `{x:12,y:694,width:366,height:134,right:378,bottom:828}`
- transform: identity; page within stage `true`; scroll 390×844; no document overflow

### Desktop 1440×900

- stage: `{x:16,y:72,width:1408,height:756,right:1424,bottom:828}`
- book: `{x:120,y:50,width:1200,height:800,right:1320,bottom:850}`
- pages 36/37: each 600×800, bottoms 850
- controls: `{x:16,y:828,width:1408,height:56,right:1424,bottom:884}`
- transform: identity; no document overflow
- Truthful note: book is vertically centered and stage clips 22px at top and bottom. Not caused by short-touch rule.

### Short desktop 1024×400 scope check

- media: coarse `false`, hover none `false`
- transform: identity; touch-landscape override does not apply
- stage: `{x:16,y:72,width:992,height:256,right:1008,bottom:328}`
- book: `{x:16,y:-98.65625,width:992,height:661.328125,right:1008,bottom:562.671875}`
- controls: `{x:16,y:328,width:992,height:56,right:1008,bottom:384}`
- no document overflow
- Truthful note: desktop remains heavily stage-clipped at this unusually short height. Scope fix intentionally avoids changing desktop behavior; robust all-pointer short-height fitting remains separate work.

## Concerns

- 320×568 portrait and short desktop retain pre-existing stage clipping, now explicitly recorded. Reviewed acceptance required 480×320 transformed/page bottom inside stage; that case passes with native sizing.
- Desktop 1440×900 clips 22px at each vertical edge because PageFlip reaches 800px while stage is 756px.
- Large book still mounts 324 page elements; no performance profile performed.

## Shutdown

Production server and Chrome debug process stopped after final capture.
