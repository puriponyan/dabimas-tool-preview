(function(root){
'use strict';
var TALENT='これは凄い素質の馬ですね';
var TITLE='将来はいくつかのタイトルも狙えるでしょうね',GR={A:[100,null],B:[85,99],C:[70,84],D:[55,69],E:[0,54]};
function norm(s){return s.replace(/[\s。！？!?*_]/g,'');}
function detect(text,target){target=target||TITLE;var hits=[],block=[],active=false;function flush(){for(var i=0;i<block.length;i++)for(var j=i+1;j<=Math.min(block.length,i+4);j++){var raw=block.slice(i,j).join('\n');if(norm(raw)===norm(target))hits.push(raw);}block=[];}String(text).split(/\r?\n/).forEach(function(line){var h=/^([^：:]+)[：:](.*)$/.exec(line.trim());if(h){flush();active=['博士コメント','特徴','目標レース','解析コメント'].indexOf(h[1].trim())>=0;if(active&&h[2].trim())block.push(h[2]);}else if(!line.trim())flush();else if(active)block.push(line);});flush();return hits;}
function compute(x){
var r={status:'',sp:null,st:null,sumMin:null,hits:detect(x.text||''),talentHits:detect(x.text||'',TALENT),used:[],notes:[]};
if(x.scene!=='owned-pre'){r.status='解析場面の確認が必要';return r;}
if(!GR[x.sp]||!GR[x.st]){r.status='能力ランクを要確認';return r;}
var s=GR[x.sp].slice(),t=GR[x.st].slice();r.used.push('能力ランク');
if(r.talentHits.length){s[0]=Math.max(s[0],81);t[0]=Math.max(t[0],81);r.used.push('凄い素質：SP・ST各81以上（2018年参考条件）');}
if(r.hits.length){if(x.sex==='牡')r.sumMin=160;else if(x.sex==='牝')r.sumMin=150;else if(x.sex==='不明'){r.sumMin=150;r.notes.push('性別による追加絞り込み未実施');}else if(x.sex==='セン')r.notes.push('センのタイトル条件未確認：タイトル条件は未使用');else{r.status='性別を要確認';return r;}if(r.sumMin!==null)r.used.push('タイトル：SP＋ST≧'+r.sumMin+'（2018年参考条件）');}
if(!r.hits.length&&!r.talentHits.length)r.notes.push('対象2文未検出：ランク条件のみ。その他の文は未判定');
if((s[1]!==null&&s[0]>s[1])||(t[1]!==null&&t[0]>t[1])){r.status='候補なし・入力と参考条件を要確認';return r;}
var m=r.sumMin;if(m!==null){if(s[1]!==null&&t[1]!==null&&s[1]+t[1]<m){r.status='候補なし・入力と参考条件を要確認';return r;}if(t[1]!==null)s[0]=Math.max(s[0],m-t[1]);if(s[1]!==null)t[0]=Math.max(t[0],m-s[1]);}
r.sp=s;r.st=t;r.status=r.used.length>1?'参考条件による候補':'ランク条件のみ';return r;
}
function fingerprint(x){return JSON.stringify([x.text,x.source,x.sex,x.sp,x.st,x.editId,x.flags,x.sexManual,x.spManual,x.stManual]);}
root.ownedHorseInitialEstimateDraftV1={detect:detect,compute:compute,fingerprint:fingerprint};
if(typeof document==='undefined'||typeof S==='undefined'||typeof F==='undefined'||typeof render!=='function'||typeof resetAll!=='function')return;
if(document.getElementById('initial-estimate-draft-v1'))return;
var parent=document.getElementById('s1');if(!parent)return;
var box=document.createElement('section');box.id='initial-estimate-draft-v1';box.style.cssText='margin:16px 0;padding:12px;border:1px solid var(--border);border-radius:8px;';
function p(text){var e=document.createElement('p');e.textContent=text;box.appendChild(e);return e;}
var heading=document.createElement('h3');heading.textContent='入厩前能力推定（参考試作）';box.appendChild(heading);
p('所有馬の入厩前・潜在能力と確認できる場合だけ実行してください。産駒予想・入厩後・場面不明は対象外。原文と手動入力を組み合わせる閲覧専用計算です。');
var values=p(''),button=document.createElement('button');button.type='button';button.textContent='入厩前の潜在能力として確認して推定';button.style.cssText='min-height:44px;font-size:16px;width:100%;';box.appendChild(button);var output=p('');output.style.whiteSpace='pre-wrap';
p('素質・タイトル下限は2018年資料由来・現行境界未検証。結果と場面確認はJSONに保存しません。');var link=document.createElement('a');link.href='https://dbmsmemo.blogspot.com/2018/02/blog-post_20.html';link.textContent='参考資料：初期値新方式（2018年）';link.target='_blank';link.rel='noopener noreferrer';box.appendChild(link);parent.appendChild(box);
var signature=null;
function read(){return {text:document.getElementById('txt').value,source:S.src,sex:F.sex.v||'不明',sp:F.spd.v,st:F.sta.v,editId:typeof editId==='undefined'?null:editId,flags:[F.sex.n,F.sex.m,F.sex.u,F.spd.n,F.spd.m,F.spd.u,F.sta.n,F.sta.m,F.sta.u],sexManual:F.sex.u,spManual:F.spd.u,stManual:F.sta.u};}
function gate(x){if(x.source===null||x.text!==x.source)return '候補未作成、または原文変更後です。先に候補を作成してください。';if(x.flags[1]||x.flags[4]||x.flags[7]||(x.flags[0]&&!x.flags[2])||(x.flags[3]&&!x.flags[5])||(x.flags[6]&&!x.flags[8]))return '性別・能力ランクに未解決の注意があります。';return '';}
function refresh(force){var x=read(),key=fingerprint(x),g=gate(x);values.textContent='使用値：性別 '+x.sex+'／SP '+(x.sp||'未入力')+'／ST '+(x.st||'未入力')+'（手動入力：性別 '+(x.sexManual?'あり':'なし')+'・SP '+(x.spManual?'あり':'なし')+'・ST '+(x.stManual?'あり':'なし')+'）';button.disabled=!!g;if(force||signature!==key){signature=null;output.textContent=g||'未推定。場面と使用値の確認が必要です。';}}
function fmt(a){return a[1]===null?a[0]+'以上・上限未確定':a[0]+'～'+a[1];}
button.addEventListener('click',function(){var x=read(),g=gate(x);if(g){refresh(true);return;}var r=compute({text:x.source,scene:'owned-pre',sex:x.sex,sp:x.sp,st:x.st});signature=fingerprint(x);var lines=[r.status,'使用した条件：'].concat(r.used.map(function(v){return '・'+v;}));if(r.sp){lines.push('潜在SP候補：'+fmt(r.sp),'潜在ST候補：'+fmt(r.st));if(r.sumMin!==null)lines.push('組み合わせ条件：SP＋ST≧'+r.sumMin);lines.push('個別範囲内の任意の組が適合するとは限りません。実測確定値ではありません。');}output.textContent=lines.concat(r.notes).join('\n');});
document.addEventListener('input',function(e){if(!box.contains(e.target))refresh(false);});document.addEventListener('change',function(e){if(!box.contains(e.target))refresh(false);});
var oldRender=render;render=function(){var v=oldRender.apply(this,arguments);refresh(true);return v;};var oldReset=resetAll;resetAll=function(){var v=oldReset.apply(this,arguments);refresh(true);return v;};refresh(true);
})(typeof window==='undefined'?globalThis:window);
