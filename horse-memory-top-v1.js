(function(){
'use strict';
var form=document.getElementById('s1');
var base=document.getElementById('cb');
var mem=document.getElementById('mem');
var flag=document.getElementById('flag1');
var growth=document.getElementById('g1');
var label=form&&form.querySelector('label[for="mem"]');
var heading=label&&label.previousElementSibling;
if(!form||!base||!mem||!flag||!growth||!label||!heading||heading.textContent.trim()!=='■ メモリ・成長情報'||base.parentNode!==form||heading.parentNode!==form||label.parentNode!==form||mem.parentNode!==form||flag.parentNode!==form||growth.parentNode!==form){
console.warn('メモリ欄の配置変更を見送りました。元の配置を維持します。');
return;
}
var box=document.createElement('div');
box.id='memory-top-v1';
base.insertAdjacentElement('afterend',box);
[heading,label,mem,flag,growth].forEach(function(node){box.appendChild(node);});
})();
