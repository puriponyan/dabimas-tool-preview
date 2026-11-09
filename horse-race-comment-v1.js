(function(){
'use strict';
if(typeof CMT==='undefined'||!Array.isArray(CMT)||typeof CMX==='undefined'||!Array.isArray(CMX)||typeof cmFind!=='function'||typeof cmNorm!=='function')throw new Error('コメント対応表を確認できないため追加を中止しました');
var entry={c:'exp',src:'活躍時期も早そうですし朝日杯フューチュリティステークスを目標に仕上げてみてはいかがでしょうか',out:'活躍時期も早そうとの評価\n朝日杯フューチュリティステークスを目標に仕上げる提案'};
var key=cmNorm(entry.src);
if(cmFind(CMX,key))throw new Error('既存の除外対象と競合するため追加を中止しました');
var existing=cmFind(CMT,key);
if(existing){if(existing.c!==entry.c||existing.out!==entry.out)throw new Error('既存のコメント対応と競合するため追加を中止しました');return;}
CMT.push(entry);
})();
