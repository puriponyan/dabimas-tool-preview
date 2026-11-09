(function(){
'use strict';
if(typeof commentExtract!=='function'||typeof cmNorm!=='function'||typeof cmFind!=='function'||typeof headOf!=='function'||typeof isOtherHead!=='function'||typeof CMT==='undefined'||typeof CMX==='undefined')throw new Error('コメント処理を確認できないため追加を中止しました');
var full='スピードが付きそうな馬体ですね\n短距離適正もありそうですし\n牛嶋厩舎を推奨します';
var key=cmNorm(full);
commentExtract=function(text){
 var res={tal:[],fut:[],fea:[],exp:[]},un=false,sec=null,cur=[];
 function add(s){var t=s.replace(/^[\s>#\-+*_・●•]+/,'');(t.match(/[^。！？!?]+[。！？!?]*/g)||[]).forEach(function(p){if(cmNorm(p)!=='')cur.push(p);});}
 function flush(){var i=0;
  while(i<cur.length){var hit=false;
   for(var n=Math.min(cur.length,i+4);n>i;n--){if(cmNorm(cur.slice(i,n).join(''))===key){res.fea.push(full);i=n;hit=true;break;}}
   if(hit)continue;
   for(var j=i;j<cur.length&&j<i+4;j++){var k=cmNorm(cur.slice(i,j+1).join('')),e=cmFind(CMT,k);
    if(e){res[e.c].push(e.out);hit=true;}else if(cmFind(CMX,k)){hit=true;}
    if(hit){i=j+1;break;}
   }
   if(!hit){un=true;i++;}
  }
  cur=[];
 }
 text.split(/\r?\n/).forEach(function(line){var h=headOf(line);if(h){flush();sec=h.name;add(h.rest);return;}if(isOtherHead(line)){flush();sec=null;return;}if(line.trim()===''){flush();return;}if(sec)add(line);});
 flush();return {res:res,un:un};
};
})();
