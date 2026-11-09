(function(){
'use strict';
var targets=['s1','s2','dt'];
function detect(text){
 var rows=[],lines=String(text||'').split(/\r?\n/);
 lines.forEach(function(line,i){
  var kind=null;
  if(/BC登録は[ \u3000\t]*まだ先ですね/.test(line))kind='まだ先（空白の有無を原文で確認）';
  else if(line.indexOf('完成まであと一息でしょうか')>=0)kind='完成まであと一息';
  else if(line.indexOf('準備はできたようですね')>=0)kind='準備はできた';
  if(kind)rows.push({line:i+1,raw:line,kind:kind});
 });
 return rows;
}
function draw(parentId,text){
 var parent=document.getElementById(parentId);if(!parent)return;
 var id='measurement-comments-v1-'+parentId,old=document.getElementById(id);
 if(old)old.remove();
 var box=document.createElement('section');box.id=id;
 box.style.cssText='margin:16px 0;padding:12px;border:1px solid var(--border);border-radius:8px;';
 function p(t){var el=document.createElement('p');el.textContent=t;box.appendChild(el);return el;}
 p('■ 測定用コメント（検出試作v1）');
 p('表示場面：未確定／数値・到達率は判定していません');
 var rows=detect(text);
 if(!rows.length)p('この試作の対象3種類は検出されませんでした。その他のコメントは未判定です。');
 rows.forEach(function(r){
  p('原文 '+r.line+'行目：'+r.kind);
  var pre=document.createElement('pre');pre.textContent=r.raw;
  pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;tab-size:4;';box.appendChild(pre);
  var visible=r.raw.replace(/ /g,'[半角空白]').replace(/\u3000/g,'[全角空白]').replace(/\t/g,'[タブ]');
  var helper=p('空白確認用：'+visible);helper.style.cssText='font-size:13px;overflow-wrap:anywhere;';
 });
 p('閲覧専用。入力原文・登録内容・JSONは変更しません。文言が一致しても測定条件の成立を保証しません。');
 if(parentId==='s1'){
  var marker=document.getElementById('cg');
  if(marker&&marker.parentNode===parent)marker.insertAdjacentElement('afterend',box);else parent.appendChild(box);
 }else parent.appendChild(box);
}
if(typeof render!=='function'||typeof renderConfirm!=='function'||typeof showDetail!=='function'||typeof resetAll!=='function'||typeof S==='undefined'||typeof REG==='undefined')return;
var originalRender=render;
render=function(){var result=originalRender.apply(this,arguments);draw('s1',S.src);return result;};
var originalConfirm=renderConfirm;
renderConfirm=function(text){var result=originalConfirm.apply(this,arguments);draw('s2',text);return result;};
var originalDetail=showDetail;
showDetail=function(id){var result=originalDetail.apply(this,arguments),record=REG.find(function(r){return r.id===id;});if(record)draw('dt',record.text);return result;};
var originalReset=resetAll;
resetAll=function(){var result=originalReset.apply(this,arguments);targets.forEach(function(t){var box=document.getElementById('measurement-comments-v1-'+t);if(box)box.remove();});return result;};
window.ownedHorseMeasurementCommentPreviewV1={detect:detect};
draw('s1',S.src);
})();
