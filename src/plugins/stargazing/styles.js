export const STYLES = `
:host{color-scheme:var(--sgs-scheme,dark)}
[hidden]{display:none!important}
*,*::before,*::after{box-sizing:border-box}
dialog{width:min(900px,calc(100% - 24px));max-width:none;max-height:calc(100% - 24px);height:min(680px,calc(100% - 24px));padding:0;border:1px solid var(--sgs-border);border-radius:var(--sgs-radius,12px);background:var(--sgs-bg);color:var(--sgs-text);font:calc(13px + var(--sgs-font-offset,0px))/1.55 var(--sgs-font,sans-serif);box-shadow:0 16px 58px #0008;overflow:hidden}
dialog[open]{display:flex;flex-direction:column}
dialog::backdrop{background:#090b0fb0}
header{flex:none;display:grid;gap:9px;padding:13px 16px 10px;border-bottom:1px solid var(--sgs-border);background:linear-gradient(var(--sgs-raised),var(--sgs-surface))}
.heading{display:flex;align-items:center;gap:8px;min-width:0}
h1{display:flex;align-items:center;gap:8px;min-width:0;margin:0 auto 0 0;font-size:1.4em;line-height:1.2;font-weight:650;color:var(--sgs-accent)}
h1 svg{width:1.1em;height:1.1em;flex:none}
button.icon{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;margin:0;padding:0;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-surface);color:var(--sgs-text);cursor:pointer}
button.icon svg{width:17px;height:17px}
button.icon:hover:not(:disabled){color:var(--sgs-accent);border-color:var(--sgs-accent)}
button.icon:disabled{opacity:.5;cursor:wait}
:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
.filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.85fr);gap:8px}
.filters input,.filters select{width:100%;font-size:inherit;border-color:var(--sgs-border)}
.meta{color:var(--sgs-muted);font-size:.88em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.content{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:12px 16px 15px}
.content p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.content .message{padding:12px 0;color:var(--sgs-muted)}
.content .error{padding:0 0 12px;color:var(--sgs-danger)}
.content section+section{margin-top:22px}
h2{margin:0 0 6px;font-size:1.12em;color:var(--sgs-accent);overflow-wrap:anywhere}
table{width:100%;table-layout:fixed;border-collapse:collapse;text-align:left}
th,td{padding:7px 8px;border-bottom:1px solid var(--sgs-border);vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}
th{background:var(--sgs-raised);font-weight:600}
th[data-field="时间"]{width:20%}
th[data-field="名称"]{width:18%}
th[data-field="奖励"]{width:24%}
th[data-field="价格"],th[data-field="预估价格"]{width:14%}
th[data-field="限购"],th[data-field="编号"]{width:11%}
th:first-child{border-radius:6px 0 0 0}
th:last-child{border-radius:0 6px 0 0}
tbody tr:nth-child(even){background:var(--sgs-surface)}
.field-name{display:none}
ul{margin:0;padding-left:1.3em;overflow-wrap:anywhere}
a{color:var(--sgs-accent);text-underline-offset:2px}
footer{flex:none;padding:8px 16px;border-top:1px solid var(--sgs-border);background:var(--sgs-surface);font-size:.85em;color:var(--sgs-muted);overflow-wrap:anywhere}
footer a{white-space:nowrap}
@media(max-width:600px){
  header,footer{padding-left:11px;padding-right:11px}
  .content{padding:10px 11px}
  table,tbody,tr{display:block}
  thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
  tbody tr{padding:6px 5px;border-bottom:1px solid var(--sgs-border)}
  tbody td{display:grid;grid-template-columns:minmax(0,4em) minmax(0,1fr);gap:5px;padding:2px 4px;border:0}
  .field-name{display:block;color:var(--sgs-muted)}
}
@media(max-width:360px){
  .filters{grid-template-columns:minmax(0,1fr);gap:5px}
}
@media(max-height:350px){
  header{gap:5px;padding-top:6px;padding-bottom:6px}
  footer{padding-top:4px;padding-bottom:4px}
}
@media(min-width:285px) and (max-height:350px){
  .filters{grid-template-columns:minmax(0,1fr) minmax(0,.9fr)}
}
`;
