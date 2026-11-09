(function(){
'use strict';
if(typeof CMT==='undefined'||!Array.isArray(CMT)||typeof cmFind!=='function'||typeof cmNorm!=='function')throw new Error('コメント対応表を確認できないため追加を中止しました');
var entry={c:'fea',src:'強い心肺機能を備えてますね長距離馬の育成が得意な八木沼厩舎でスタミナ強化が良いでしょう',out:'強い心肺機能を備えてますね\n長距離馬の育成が得意な八木沼厩舎で\nスタミナ強化が良いでしょう'};
var existing=cmFind(CMT,cmNorm(entry.src));
if(existing){if(existing.c!==entry.c||existing.out!==entry.out)throw new Error('既存のコメント対応と競合するため追加を中止しました');return;}
CMT.push(entry);
})();
