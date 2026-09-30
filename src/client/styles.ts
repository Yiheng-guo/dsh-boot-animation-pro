/**
 * The stylesheet, injected once.
 *
 * Kept in its own module so `scripts/check-css-template.mjs` has one obvious
 * place to guard: the sheet is a template literal, and a stray backtick inside
 * it ends the literal and breaks the build in a way that leaves the previous
 * bundle in place — which once shipped silently.
 *
 * The layout note is load-bearing: the two fit modes differ ONLY by `object-fit`.
 * An earlier "improvement" that also rewrote the layout mechanics took the overlay
 * fully black in the real app, so it was reverted and is not to be retried. Every
 * decoration added since — captions, watermark, progress bar, the effects layer —
 * is a SEPARATE absolutely-positioned child, so none of them touches the video's
 * own sizing.
 */
export const STYLE_ID = 'dsh-boot-animation-pro-style'

export const CSS = `
.dbap-root{position:fixed;inset:0;z-index:2147483000;background:#000;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;cursor:pointer;overflow:hidden;
  transition:opacity .36s ease}
.dbap-root.dbap-fading{opacity:0}
.dbap-video{width:100%;height:100%;object-fit:contain;background:#000;display:block}
/* The ONLY difference between the fit modes is object-fit.
   Do not "harden" this with position/inset changes: the bar fix does not need
   them, and an overlay that rendered correctly under flex + percentage sizing
   went fully black in the real app the one time the layout mechanics were
   rewritten for no reason. Minimal change, or you trade a cosmetic defect for a
   functional one.
   NOTE: never put a backtick in this block — the whole sheet is a template
   literal, and one backtick ends it. scripts/check-css-template.mjs enforces it. */
.dbap-video.dbap-cover{object-fit:cover;object-position:center}

/* Decoration. One absolutely-positioned layer, aria-hidden by construction:
   it never receives the pointer, so every click still reaches the overlay. */
.dbap-fx{position:absolute;inset:0;z-index:1;pointer-events:none}
.dbap-fx-scanlines{background:repeating-linear-gradient(180deg,
  rgba(255,255,255,.055) 0 1px, rgba(0,0,0,0) 1px 3px);
  mix-blend-mode:overlay}
.dbap-fx-vignette{background:radial-gradient(ellipse at center,
  rgba(0,0,0,0) 42%, rgba(0,0,0,.72) 100%)}
.dbap-fx-grain{opacity:.16;
  background-image:radial-gradient(rgba(255,255,255,.9) .5px, rgba(0,0,0,0) .5px),
    radial-gradient(rgba(255,255,255,.7) .5px, rgba(0,0,0,0) .5px);
  background-size:3px 3px, 5px 5px;background-position:0 0, 2px 1px}
.dbap-fx-glow{box-shadow:inset 0 0 140px rgba(96,178,255,.30), inset 0 0 40px rgba(0,0,0,.55)}

.dbap-caption{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);
  z-index:2;text-align:center;pointer-events:none;max-width:82vw;
  font-family:inherit;text-shadow:0 2px 18px rgba(0,0,0,.92)}
.dbap-caption-title{font-size:clamp(22px,3.4vw,44px);font-weight:600;
  letter-spacing:.06em;color:rgba(255,255,255,.96)}
.dbap-caption-sub{margin-top:6px;font-size:clamp(12px,1.3vw,17px);
  letter-spacing:.22em;color:rgba(255,255,255,.72)}
.dbap-watermark{position:absolute;right:22px;bottom:22px;z-index:2;
  pointer-events:none;font-family:inherit;font-size:12.5px;letter-spacing:.08em;
  color:rgba(255,255,255,.5);text-shadow:0 1px 10px rgba(0,0,0,.9)}
.dbap-progress{position:absolute;left:0;right:0;bottom:0;height:3px;z-index:3;
  background:rgba(255,255,255,.14);pointer-events:none}
.dbap-progress i{display:block;height:100%;width:0;
  background:linear-gradient(90deg,rgba(96,178,255,.95),rgba(7,193,96,.95));
  transition:width .18s linear}

.dbap-skip{position:absolute;top:20px;right:22px;z-index:4;
  border:1px solid rgba(255,255,255,.42);background:rgba(0,0,0,.42);
  color:#fff;border-radius:999px;padding:6px 16px;font-size:13px;line-height:1.4;
  font-family:inherit;cursor:pointer}
.dbap-skip:hover{background:rgba(0,0,0,.66)}
.dbap-hint{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);
  z-index:2;color:rgba(255,255,255,.82);font-size:13px;letter-spacing:.06em;
  font-family:inherit;text-shadow:0 1px 8px rgba(0,0,0,.9);
  animation:dbap-breathe 2.4s ease-in-out infinite;white-space:nowrap}
@keyframes dbap-breathe{0%,100%{opacity:.55}50%{opacity:1}}
.dbap-status{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  z-index:2;color:rgba(255,255,255,.88);font-size:14px;letter-spacing:.04em;
  font-family:inherit;text-align:center;max-width:78vw;
  background:rgba(0,0,0,.46);border-radius:10px;padding:10px 18px;
  text-shadow:0 1px 10px rgba(0,0,0,.9)}
.dbap-what{position:absolute;top:20px;left:22px;z-index:2;
  color:rgba(255,255,255,.72);font-size:12px;letter-spacing:.04em;
  font-family:inherit;text-shadow:0 1px 8px rgba(0,0,0,.9)}

.dbap-pin{display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:0;border-radius:8px;cursor:pointer;
  background:transparent;color:var(--dsw-alias-text-secondary,#888);
  font-size:14px;line-height:1;font-family:inherit}
.dbap-pin:hover{background:rgba(127,127,127,.16);color:var(--dsw-alias-text-primary,#191919)}
.dbap-pin.dbap-pin-on{color:#07c160;background:rgba(7,193,96,.14)}
.dbap-pin[disabled]{opacity:.4;cursor:default}

.dbap-veil{position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.46);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dbap-lib{width:min(760px,100%);max-height:min(86vh,760px);
  display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-text-primary,#191919);
  border:1px solid rgba(127,127,127,.28);border-radius:14px;padding:16px 18px 12px;
  box-shadow:0 18px 60px rgba(0,0,0,.34);font-family:inherit;
  font-size:13px;line-height:1.55}
.dbap-lib h3{margin:0 0 10px;font-size:15px;font-weight:600}
.dbap-lib p{margin:0 0 10px;color:var(--dsw-alias-text-secondary,#777);font-size:12.5px}
.dbap-tabs{display:flex;gap:4px;flex-wrap:wrap;
  border-bottom:1px solid rgba(127,127,127,.22);margin-bottom:12px}
.dbap-tab{border:0;background:transparent;color:inherit;font-family:inherit;
  font-size:12.5px;padding:6px 12px;cursor:pointer;border-radius:8px 8px 0 0;
  border-bottom:2px solid transparent;margin-bottom:-1px}
.dbap-tab:hover{background:rgba(127,127,127,.10)}
.dbap-tab.dbap-tab-on{color:#07974b;font-weight:600;
  border-bottom-color:rgba(7,193,96,.85)}
.dbap-body{flex:1;min-height:0;overflow:auto;padding-right:2px}

.dbap-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;
  border:1px solid transparent}
.dbap-item:hover{background:rgba(127,127,127,.10)}
.dbap-item.dbap-cur{border-color:rgba(7,193,96,.55);background:rgba(7,193,96,.10)}
.dbap-item .dbap-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbap-badge{font-size:11px;padding:1px 7px;border-radius:999px;
  background:rgba(127,127,127,.18);color:var(--dsw-alias-text-secondary,#777);white-space:nowrap}
.dbap-badge.dbap-b-sel{background:rgba(7,193,96,.16);color:#07974b}
.dbap-badge.dbap-b-prev{background:rgba(64,140,255,.18);color:#2c6bd6}
.dbap-badge.dbap-b-warn{background:rgba(210,120,40,.18);color:#b46214;cursor:help}
.dbap-meta{font-size:11.5px;color:var(--dsw-alias-text-secondary,#999);white-space:nowrap}
.dbap-dim{opacity:.78}
.dbap-mark{width:14px;text-align:center;color:#07c160;font-weight:700;font-size:12px}
.dbap-row-btn{border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;
  border-radius:7px;padding:3px 10px;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap}
.dbap-row-btn:hover{background:rgba(127,127,127,.14)}
.dbap-row-btn.dbap-go{border-color:rgba(7,193,96,.55);color:#07974b;font-weight:600}
.dbap-row-btn.dbap-danger:hover{border-color:rgba(192,57,43,.6);color:#c0392b;
  background:rgba(192,57,43,.10)}
.dbap-row-btn.dbap-star{width:26px;padding:3px 0;text-align:center;color:#d0a020}
.dbap-row-btn.dbap-star-on{border-color:rgba(208,160,32,.6);background:rgba(208,160,32,.14)}

.dbap-dir{margin:12px 0 0;padding:9px 10px;border-radius:9px;background:rgba(127,127,127,.10);
  font-size:11.5px;color:var(--dsw-alias-text-secondary,#777);word-break:break-all}
.dbap-dir code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;
  color:var(--dsw-alias-text-primary,#333)}
.dbap-bar{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;
  padding-top:10px;border-top:1px solid rgba(127,127,127,.18)}
.dbap-btn{border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;
  border-radius:8px;padding:5px 14px;font-size:12.5px;font-family:inherit;cursor:pointer}
.dbap-btn:hover{background:rgba(127,127,127,.14)}
.dbap-btn[disabled]{opacity:.5;cursor:default}
.dbap-btn.dbap-btn-on{border-color:rgba(7,193,96,.6);background:rgba(7,193,96,.12);color:#07974b}
.dbap-btn.dbap-go{border-color:rgba(7,193,96,.55);color:#07974b;font-weight:600}
.dbap-btn.dbap-danger:hover{border-color:rgba(192,57,43,.6);color:#c0392b;
  background:rgba(192,57,43,.10)}
.dbap-btn.dbap-wide{display:block;width:100%;text-align:left;margin-bottom:6px}
.dbap-msg{margin-top:8px;font-size:12px;min-height:16px;
  color:var(--dsw-alias-text-secondary,#777)}
.dbap-msg.dbap-err{color:#c0392b}
.dbap-msg.dbap-ok{color:#07974b}

.dbap-choice{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;
  margin-bottom:10px;font-size:12px;
  color:var(--dsw-alias-text-secondary,#777)}
.dbap-choice.dbap-wrap{flex-wrap:wrap}
.dbap-choice-label{flex:0 0 auto;margin-right:2px}
.dbap-stack{display:flex;flex-direction:column;gap:0;margin-bottom:12px}
.dbap-sort{margin-bottom:12px}
.dbap-field{display:flex;align-items:center;gap:10px;margin-bottom:10px;
  font-size:12.5px;color:var(--dsw-alias-text-secondary,#777)}
.dbap-field-label{flex:0 0 auto;min-width:120px}
.dbap-field-label em{font-style:normal;opacity:.72;font-size:11.5px}
.dbap-input{border:1px solid rgba(127,127,127,.34);border-radius:8px;
  background:var(--dsw-alias-bg-elevated,#fff);color:inherit;
  font-family:inherit;font-size:12.5px;padding:4px 9px;min-width:0;flex:1}
.dbap-input.dbap-num{flex:0 0 96px;width:96px}
.dbap-input.dbap-time{flex:0 0 104px;width:104px}
.dbap-input.dbap-inline-rename{flex:1;min-width:0}
.dbap-range{flex:1;min-width:80px}
.dbap-toggle{display:inline-flex;align-items:center;gap:7px;margin:0 14px 10px 0;
  font-size:12.5px;color:var(--dsw-alias-text-secondary,#777);cursor:pointer}
.dbap-toggle input{cursor:pointer}

.dbap-rule{border:1px solid rgba(127,127,127,.24);border-radius:10px;
  padding:8px 10px;margin-bottom:8px;background:rgba(127,127,127,.05)}
.dbap-rule.dbap-rule-off{opacity:.55}
.dbap-rule.dbap-rule-new{border-style:dashed;background:transparent}
.dbap-rule-top{display:flex;align-items:center;gap:8px;justify-content:space-between}
.dbap-rule-top .dbap-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.dbap-rule-bottom{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.dbap-rule-label{flex:1;min-width:120px}
.dbap-day{width:30px;padding:4px 0;text-align:center}
.dbap-about{margin:6px 0 0;font-size:12px;color:var(--dsw-alias-text-secondary,#777)}
.dbap-about dt{font-weight:600;color:var(--dsw-alias-text-primary,#333)}
.dbap-about dd{margin:2px 0 0}
.dbap-about code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;
  word-break:break-all}
`

/** Inject the sheet once per document. */
export function ensureStyle(): void {
  try {
    if (document.getElementById(STYLE_ID) !== null) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  } catch {
    /* no document (tests): styling is cosmetic, never fatal */
  }
}
