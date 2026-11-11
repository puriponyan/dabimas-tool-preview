(function(root){
'use strict';
function keepInput(f){return !!(f&&(f.v!==''||f.raw!==''||f.u||f.n||f.m));}
function keepPreview(f){return !!(f&&(f.v!==''||f.m||(f.n&&!f.u)));}
function distanceWarning(a,b,d){return !!(d&&d.n&&!(a.u&&b.u));}
function keepDistance(a,b,d){return keepPreview(a)||keepPreview(b)||distanceWarning(a,b,d);}
root.ownedHorseCompactFieldsV1={keepInput:keepInput,keepPreview:keepPreview,keepDistance:keepDistance};
if(typeof document==='undefined')return;
if(document.getElementById('compact-fields-toggle-v1'))return;
if(typeof F==='undefined'||typeof S==='undefined'||typeof UI==='undefined'||typeof CR==='undefined'||typeof KEYS==='undefined'||typeof DN==='undefined'||typeof render!=='function'||typeof renderConfirm!=='function'||typeof resetAll!=='function')return;
var form=document.getElementById('s1'),preview=document.getElementById('s2');
if(!form||!preview)return;
var groups=[['cb','oc1',['sex','color']],['cd','oc2',['dAge','dYear','dMonth','dWeek']],['ca','oc3',['aAge','aMonth','aWeek']],['ce','oc4',['cls','spd','sta','grt','tmp','con']],['cf','oc5',['sty','dLo','dHi','apt']],['cg','oc6',['tal','fut','fea','exp']]];
var inputs={},rows={},heads={},previewHeads={};
function heading(el){var p=el&&el.previousElementSibling;return p&&p.tagName==='P'&&p.textContent.trim().indexOf('■ ')===0?p:null;}
for(var i=0;i<KEYS.length;i++){var k=KEYS[i];if(!UI[k]||!UI[k].el||!UI[k].el.parentElement)return;inputs[k]=UI[k].el.parentElement;if(CR[k])rows[k]=CR[k].parentElement;}
for(var j=0;j<groups.length;j++){var g=groups[j],a=document.getElementById(g[0]),b=document.getElementById(g[1]);if(!a||!b)return;heads[g[0]]=g[0]==='cb'?null:heading(a);previewHeads[g[1]]=g[1]==='oc1'?null:heading(b);if(g[0]!=='cb'&&(!heads[g[0]]||!previewHeads[g[1]]))return;}
if(!CR.dist||!CR.dist.parentElement)return;
for(var q=0;q<KEYS.length;q++){var key=KEYS[q];if(key!=='dLo'&&key!=='dHi'&&!rows[key])return;}
var memOut=document.getElementById('o-mem'),growth=document.getElementById('g2'),marker=document.getElementById('n1');
var memLabel=memOut&&memOut.previousElementSibling,memHead=memLabel&&heading(memLabel);
if(!memOut||!growth||!memLabel||!memHead||!marker)return;
var expanded=false,toggle=document.createElement('button');
toggle.id='compact-fields-toggle-v1';toggle.type='button';toggle.style.cssText='min-height:44px;width:100%;font-size:16px;margin:8px 0;';
function visible(el,on){if(!el)return;if(on)el.removeAttribute('data-compact-hidden-v1');else el.setAttribute('data-compact-hidden-v1','');}
function inputView(){
var active=S.src!==null;
toggle.textContent=expanded?'未入力項目を省略':'未入力項目を表示';toggle.setAttribute('aria-expanded',String(expanded));
groups.forEach(function(g){var any=false;g[2].forEach(function(k){var warning=(k==='dLo'||k==='dHi')&&distanceWarning(F.dLo,F.dHi,DN);var on=!active||expanded||keepInput(F[k])||warning;visible(inputs[k],on);any=any||on;});visible(heads[g[0]],any);});
}
function previewView(){
groups.forEach(function(g){var keys=g[0]==='cf'?['sty','dist','apt']:g[2],any=false;keys.forEach(function(k){var on=k==='dist'?keepDistance(F.dLo,F.dHi,DN):keepPreview(F[k]);visible(k==='dist'?CR.dist.parentElement:rows[k],on);any=any||on;});visible(previewHeads[g[1]],any);});
var memOn=S.mem!=='不明'||S.memU||S.flag||S.memNote||S.growthList.length>0;
visible(memOut,memOn);visible(memLabel,memOn);visible(memHead,memOn||growth.style.display!=='none');
}
var style=document.createElement('style');style.textContent='#s1 [data-compact-hidden-v1],#s2 [data-compact-hidden-v1]{display:none!important}';document.head.appendChild(style);
marker.insertAdjacentElement('beforebegin',toggle);
toggle.addEventListener('click',function(){expanded=!expanded;inputView();});
var oldRender=render;render=function(){var r=oldRender.apply(this,arguments);inputView();return r;};
var oldConfirm=renderConfirm;renderConfirm=function(){var r=oldConfirm.apply(this,arguments);previewView();return r;};
var oldReset=resetAll;resetAll=function(){expanded=false;var r=oldReset.apply(this,arguments);inputView();return r;};
inputView();
})(typeof window==='undefined'?globalThis:window);
