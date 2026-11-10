(function(){
'use strict';
if(typeof CMT==='undefined'||!Array.isArray(CMT)||typeof CMX==='undefined'||!Array.isArray(CMX)||typeof cmFind!=='function'||typeof cmNorm!=='function')throw new Error('コメント対応表を確認できないため追加を中止しました');
var entry={c:'exp',src:'まずは桜花賞を目指しましょう',out:'桜花賞を目標にする提案'};
var key=cmNorm(entry.src),existing=cmFind(CMT,key);
var excluded=CMX.filter(function(e){return cmNorm(e.src)===key;});
if(existing&&(existing.c!==entry.c||existing.out!==entry.out))throw new Error('既存のコメント対応と競合するため追加を中止しました');
if(excluded.length>1||(!existing&&excluded.length!==1))throw new Error('既存の桜花賞除外を確認できないため追加を中止しました');
if(!existing)CMT.push(entry);
for(var i=CMX.length-1;i>=0;i--)if(cmNorm(CMX[i].src)===key)CMX.splice(i,1);
})();
