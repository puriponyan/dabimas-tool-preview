(function(){
'use strict';
if(typeof CMT==='undefined'||!Array.isArray(CMT)||typeof cmFind!=='function'||typeof cmNorm!=='function')throw new Error('コメント対応表を確認できないため追加を中止しました');
var entry={c:'fut',src:'将来は海外も視野に入れたほうが良いでしょう',out:'海外も視野に入れるとの評価'};
var existing=cmFind(CMT,cmNorm(entry.src));
if(existing){if(existing.c!==entry.c||existing.out!==entry.out)throw new Error('既存のコメント対応と競合するため追加を中止しました');return;}
CMT.push(entry);
})();
