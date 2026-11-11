/* Owned horses persistence comparison v1. Unpublished candidate, 2026-11-11. */
/* Owned horses persistence v1: core draft, not connected to the app. */
(function (root) {
  'use strict';
  var KIND = 'dabimas-owned-horses-persistence';
  var DB_NAME = 'dabimas-owned-horses-persistence-preview-v1';
  var STORE = 'snapshots', KEY = 'registered-horses';
  var MAX_BYTES = 5000000;
  function fault(code, message, cause) {
    var e = new Error(message); e.code = code;
    if (cause) e.cause = cause;
    return e;
  }
  function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function header(x) {
    return object(x) && x.kind === KIND && x.version === 1 &&
      Number.isSafeInteger(x.revision) && x.revision > 0 &&
      typeof x.savedAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x.savedAt) &&
      Number.isFinite(Date.parse(x.savedAt)) &&
      new Date(x.savedAt).toISOString() === x.savedAt && typeof x.payload === 'string';
  }
  function checkPayload(text, validate) {
    if (typeof text !== 'string') throw fault('INVALID_PAYLOAD', '保存内容が文字列ではありません。');
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
      throw fault('TOO_LARGE', '記録データが5,000,000バイトを超えています。');
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw fault('INVALID_PAYLOAD', 'JSONとして読み取れません。', e); }
    if (!object(parsed) || parsed.kind !== 'horse-app-backup' || parsed.version !== 2)
      throw fault('UNSUPPORTED_PAYLOAD', '端末内保存の記録部分はバックアップv2が必要です。');
    var result;
    try { result = validate(text); }
    catch (e) { throw fault('VALIDATOR_FAILED', '既存の記録検査を完了できませんでした。', e); }
    if (!result || result.ok !== true)
      throw fault('INVALID_PAYLOAD', (result && result.reason) || '記録データが不正です。');
    if (!Array.isArray(result.records) || result.records.length > 500 ||
        parsed.count !== result.records.length || !Number.isSafeInteger(result.nextSeq) ||
        result.nextSeq < 0 || result.nextSeq !== parsed.nextSeq)
      throw fault('VALIDATOR_CONTRACT', '記録検査の結果が想定した構造ではありません。');
    return result;
  }
  function inspect(raw, validate) {
    if (raw === undefined) return {found: false, revision: 0, validated: null};
    if (!object(raw) || raw.kind !== KIND || raw.version !== 1)
      throw fault('UNSUPPORTED_ENVELOPE', '端末内保存が不正または未対応形式です。');
    if (!header(raw)) throw fault('INVALID_ENVELOPE', '端末内保存の管理情報が不正です。');
    return {found: true, revision: raw.revision, savedAt: raw.savedAt,
      validated: checkPayload(raw.payload, validate)};
  }
  function openDB(factory, name) {
    return new Promise(function (resolve, reject) {
      var req, ended = false;
      try { req = factory.open(name, 1); }
      catch (e) { reject(fault('OPEN_FAILED', '保存領域を開けません。', e)); return; }
      var timer = setTimeout(function () {
        if (ended) return;
        ended = true;
        reject(fault('OPEN_TIMEOUT', '保存領域の確認が時間内に完了しませんでした。'));
      }, 10000);
      function fail(code, message, cause) {
        if (ended) return;
        ended = true; clearTimeout(timer); reject(fault(code, message, cause));
      }
      req.onupgradeneeded = function () {
        if (ended) { req.transaction.abort(); return; }
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onblocked = function () { fail('OPEN_BLOCKED', '保存領域が他の接続により待機中です。'); };
      req.onerror = function () { fail('OPEN_FAILED', '保存領域を開けません。', req.error); };
      req.onsuccess = function () {
        if (ended) { req.result.close(); return; }
        ended = true; clearTimeout(timer);
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.close(); reject(fault('MISSING_STORE', '必要な保存領域がありません。')); return;
        }
        resolve(req.result);
      };
    });
  }
  function readRaw(db) {
    return new Promise(function (resolve, reject) {
      var tx, req, value;
      try {
        tx = db.transaction(STORE, 'readonly');
        req = tx.objectStore(STORE).get(KEY);
      } catch (e) { reject(fault('READ_FAILED', '保存内容を読み取れません。', e)); return; }
      req.onsuccess = function () { value = req.result; };
      tx.oncomplete = function () { resolve(value); };
      tx.onabort = function () { reject(fault('READ_FAILED', '保存内容を読み取れません。', tx.error)); };
    });
  }
  function writeRaw(db, envelope, expectedRaw) {
    return new Promise(function (resolve, reject) {
      var tx, reason;
      try {
        tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE), req = store.get(KEY);
        req.onsuccess = function () {
          try {
            var current = req.result;
            if (JSON.stringify(current) !== JSON.stringify(expectedRaw)) {
              reason = fault('CONFLICT', '保存内容が別の操作で変更されたため上書きを止めました。');
              tx.abort(); return;
            }
            store.put(envelope, KEY);
          } catch (e) { reason = fault('WRITE_FAILED', '保存要求に失敗しました。', e); tx.abort(); }
        };
      } catch (e) {
        if (tx) { try { tx.abort(); } catch (_) {} }
        reject(fault('WRITE_FAILED', '保存処理を開始できません。', e)); return;
      }
      tx.oncomplete = function () { resolve(); };
      tx.onabort = function () { reject(reason || fault('WRITE_FAILED', '保存処理は中断されました。', tx.error)); };
    });
  }
  function create(options) {
    options = options || {};
    if (typeof options.validateBackup !== 'function')
      throw fault('MISSING_VALIDATOR', '既存のvalidateBackup関数を明示的に渡してください。');
    var factory = options.indexedDB || root.indexedDB;
    var dbName = options.dbName || DB_NAME;
    var validate = options.validateBackup, db = null, tail = Promise.resolve();
    var phase = 'new', baseline, revision = 0, closeRequested = false;
    function serial(fn) {
      var next = tail.then(fn); tail = next.catch(function () {}); return next;
    }
    function blocked() { return fault('SAVING_BLOCKED', '安全のため端末内への保存を停止しています。'); }
    function close() { closeRequested = true; phase = 'closed'; if (db) db.close(); }
    function load() {
      return serial(async function () {
        if (phase !== 'new' || closeRequested) throw blocked();
        phase = 'loading';
        try {
          if (!factory) throw fault('UNAVAILABLE', 'IndexedDBを利用できません。');
          db = await openDB(factory, dbName);
          db.onversionchange = function () { phase = 'blocked'; db.close(); };
          if (closeRequested) { db.close(); throw blocked(); }
          var raw = await readRaw(db), result = inspect(raw, validate);
          if (phase !== 'loading' || closeRequested) throw blocked();
          baseline = raw; revision = result.revision; phase = 'ready'; return result;
        } catch (e) { if (!closeRequested) phase = 'blocked'; throw e; }
      });
    }
    function save(payloadText) {
      var captured = payloadText;
      return serial(async function () {
        if (phase !== 'ready' || closeRequested) throw blocked();
        try { checkPayload(captured, validate); }
        catch (validationError) {
          var cause = validationError;
          for (var depth = 0; cause && depth < 8; depth++, cause = cause.cause) {
            if (['STATE_RESTORE', 'RESTORE_BLOCKED', 'ASYNC_VALIDATOR'].indexOf(cause.code) >= 0) {
              phase = 'blocked'; break;
            }
          }
          throw validationError;
        }
        if (baseline && baseline.payload === captured)
          return {status: 'unchanged', revision: revision, savedAt: baseline.savedAt};
        if (revision >= Number.MAX_SAFE_INTEGER)
          throw fault('REVISION_LIMIT', '更新世代の上限です。保存を行いません。');
        var envelope = {kind: KIND, version: 1, revision: revision + 1,
          savedAt: new Date().toISOString(), payload: captured};
        try { await writeRaw(db, envelope, baseline); }
        catch (e) { if (e.code === 'CONFLICT') phase = 'blocked'; throw e; }
        try {
          var actual = await readRaw(db);
          if (JSON.stringify(actual) !== JSON.stringify(envelope))
            throw fault('VERIFY_MISMATCH', '書き込み後の保存内容が一致しません。');
          inspect(actual, validate);
          if (phase !== 'ready' || closeRequested) throw blocked();
          baseline = actual; revision = actual.revision;
          return {status: 'saved', revision: revision, savedAt: actual.savedAt};
        } catch (e) {
          if (!closeRequested) phase = 'blocked';
          throw fault('SAVE_UNCONFIRMED', '保存結果を確認できません。追加の保存を停止しました。', e);
        }
      });
    }
    return Object.freeze({load: load, save: save, close: close,
      getState: function () { return {phase: phase, revision: revision}; }});
  }
  var api = Object.freeze({create: create, inspect: inspect, checkPayload: checkPayload});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (!root.ownedHorsePersistenceCoreDraftV1) root.ownedHorsePersistenceCoreDraftV1 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

/* Synchronous validator isolation adapter draft. Not installed in the app. */
(function(root){
'use strict';
function fail(code,message,cause){var e=new Error(message);e.code=code;if(cause)e.cause=cause;return e;}
function create(options){
  if(!options || ['getState','setState','validate'].some(function(k){return typeof options[k]!=='function';}))
    throw fail('ADAPTER_CONFIG','状態の取得・復帰・検証関数を明示してください。');
  var active=false, poisoned=false;
  return function validateIsolated(text){
    if(poisoned)throw fail('RESTORE_BLOCKED','状態復帰に失敗したため検証を停止しています。');
    if(active)throw fail('REENTRANT_VALIDATION','検証の再入を拒否しました。');
    active=true;
    var originals, working, attempted=false, result, error;
    try{
      originals=options.getState();
      if(!originals || typeof originals!=='object')throw fail('STATE_CAPTURE','状態を取得できません。');
      try{working=JSON.parse(JSON.stringify(originals));}
      catch(e){throw fail('STATE_COPY','検証用の状態コピーを作成できません。',e);}
      attempted=true;
      options.setState(working);
      result=options.validate(text);
      if(result && typeof result.then==='function'){
        poisoned=true;
        throw fail('ASYNC_VALIDATOR','非同期の検証関数は接続できません。');
      }
      if(!result || typeof result!=='object' || typeof result.ok!=='boolean')
        throw fail('VALIDATOR_RESULT','検証結果の形式が不正です。');
    }catch(e){error=e;}
    finally{
      if(attempted){
        try{options.setState(originals);}
        catch(e){poisoned=true;error=fail('STATE_RESTORE','状態を復帰できません。保存を停止してください。',e);}
      }
      active=false;
    }
    if(error)throw error;
    return result;
  };
}
var api=Object.freeze({create:create});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else if(!root.ownedHorseValidationIsolationDraftV1)root.ownedHorseValidationIsolationDraftV1=api;
})(typeof globalThis!=='undefined'?globalThis:window);

/* App binding draft. Explicit creation only; does not replace validateBackup or save anything. */
(function(root){
'use strict';
function createOwnedHorseValidationIsolation(){
  if(!root.ownedHorseValidationIsolationDraftV1 || typeof validateBackup!=='function' ||
      typeof S==='undefined' || typeof F==='undefined' || typeof DN==='undefined' ||
      typeof CMN==='undefined' || typeof REG==='undefined' || typeof seq==='undefined' ||
      typeof editId==='undefined')throw new Error('既存検証処理と編集状態が揃っていません。');
  var originalValidate=validateBackup;
  return root.ownedHorseValidationIsolationDraftV1.create({
    getState:function(){return {S:S,F:F,DN:DN,CMN:CMN,REG:REG,seq:seq,editId:editId};},
    setState:function(x){S=x.S;F=x.F;DN=x.DN;CMN=x.CMN;REG=x.REG;seq=x.seq;editId=x.editId;},
    validate:function(text){return originalValidate(text);}
  });
}
if(!root.createOwnedHorseValidationIsolationDraftV1)
  root.createOwnedHorseValidationIsolationDraftV1=createOwnedHorseValidationIsolation;
})(typeof globalThis!=='undefined'?globalThis:window);

/* Persistence controller and commit observer draft. No automatic installation. */
(function(root){
'use strict';
function error(code,message,cause){var e=new Error(message);e.code=code;if(cause)e.cause=cause;return e;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function createController(options){
  if(!options||!options.repository||typeof options.capturePayload!=='function'||
      typeof options.applyLoaded!=='function'||typeof options.canApplyLoaded!=='function')
    throw error('CONFIG','接続先の保存部品と状態操作を明示してください。');
  var repository=options.repository,phase='new',started=false,disposed=false;
  var startupFinished=false,latest=0,confirmed=0,lastError=null,notifications=[];
  var copyState=function(){return {phase:phase,startupFinished:startupFinished,
    latestRequest:latest,confirmedRequest:confirmed,errorCode:lastError&&lastError.code||null};};
  function notify(){
    if(typeof options.onState==='function'){
      try{options.onState(copyState());}
      catch(e){notifications.push(error('STATE_NOTIFICATION','状態通知処理で例外が発生しました。',e));}
    }
  }
  function blockedByRepository(){var s=repository.getState();return s.phase==='blocked'||s.phase==='closed';}
  async function start(){
    if(started||disposed)throw error('ALREADY_STARTED','起動処理は繰り返せません。');
    started=true;phase='loading';notify();
    try{
      var loaded=await repository.load();
      if(disposed)throw error('DISPOSED','接続は終了しています。');
      if(loaded.found){
        if(!options.canApplyLoaded())throw error('RESTORE_GUARD','画面内に既存データまたは入力があります。読み戻しを止めました。');
        options.applyLoaded(clone(loaded.validated));
        phase='restored';
      }else phase='empty';
      startupFinished=true;notify();return loaded;
    }catch(e){
      if(!disposed){lastError=e;phase='blocked';startupFinished=true;notify();}
      throw e;
    }
  }
  async function persist(origin){
    if(disposed)throw error('DISPOSED','接続は終了しています。');
    if(!startupFinished)throw error('STARTUP_PENDING','保存領域の確認が終わっていません。');
    if(phase==='blocked'||blockedByRepository())throw error('SAVING_BLOCKED','端末内への保存は停止しています。');
    var request=++latest;
    var text;
    try{text=options.capturePayload();if(typeof text!=='string')throw error('PAYLOAD_TYPE','記録を文字列として取得できません。');}
    catch(e){lastError=e;phase='failed';notify();throw e;}
    phase='saving';lastError=null;notify();
    try{
      var result=await repository.save(text);
      if(disposed)return {status:'detached',request:request};
      if(result.status!=='saved'&&result.status!=='unchanged')throw error('SAVE_RESULT','保存結果が未対応の形式です。');
      if(result.status==='saved')confirmed=request;
      if(request===latest){phase=result.status==='saved'?'saved':'unchanged';lastError=null;notify();}
      return {status:result.status,request:request,origin:origin,revision:result.revision};
    }catch(e){
      if(!disposed){
        var fatal=blockedByRepository()||e.code==='SAVE_UNCONFIRMED'||e.code==='CONFLICT';
        if(fatal||request===latest){lastError=e;phase=fatal?'blocked':'failed';notify();}
      }
      throw e;
    }
  }
  function committed(origin){
    if(['register','edit','restore'].indexOf(origin)<0)
      return Promise.reject(error('ORIGIN','確定操作として未対応です。'));
    return persist(origin);
  }
  function dispose(){disposed=true;phase='closed';repository.close();notify();}
  return Object.freeze({start:start,committed:committed,retry:function(){return persist('retry');},
    getState:copyState,notificationErrors:function(){return notifications.slice();},dispose:dispose});
}
function createObserver(options){
  if(!options||typeof options.getRegistry!=='function'||typeof options.getEditId!=='function'||
      !options.controller||typeof options.schedule!=='function')throw error('CONFIG','監視先を明示してください。');
  var stopped=false,pending=0;
  function before(){var records=options.getRegistry();return {array:records,items:records.slice()};}
  function changed(old){var records=options.getRegistry();return records!==old.array||records.length!==old.items.length||records.some(function(r,i){return r!==old.items[i];});}
  function report(e){if(typeof options.onError==='function'){try{options.onError(e);}catch(_){}}}
  function saveIfChanged(old,origin){
    if(stopped||!changed(old))return;
    options.controller.committed(origin).catch(report);
  }
  function registration(){
    if(stopped)return false;
    if(!options.controller.getState().startupFinished)return false;
    if(pending)return false;
    var old=before(),origin=options.getEditId()===null?'register':'edit';
    pending++;
    options.schedule(function(){pending--;saveIfChanged(old,origin);});
    return true;
  }
  function restore(invoke){
    if(stopped||!options.controller.getState().startupFinished)return undefined;
    var old=before(),result=invoke();
    saveIfChanged(old,'restore');return result;
  }
  return Object.freeze({registration:registration,restore:restore,dispose:function(){stopped=true;}});
}
function connect(options){
  if(!options||!options.coreAPI||!options.isolationFactory||!options.host)throw error('CONFIG','保存コア・隔離検証・接続先を明示してください。');
  var host=options.host;
  var validate=options.isolationFactory();
  var repository=options.coreAPI.create({validateBackup:validate,indexedDB:options.indexedDB,dbName:options.dbName});
  var controller=createController({repository:repository,capturePayload:host.capturePayload,
    canApplyLoaded:host.canApplyLoaded,applyLoaded:host.applyLoaded,onState:options.onState});
  var observer=createObserver({controller:controller,getRegistry:host.getRegistry,getEditId:host.getEditId,
    schedule:options.schedule||function(fn){setTimeout(fn,0);},onError:options.onError});
  return Object.freeze({controller:controller,observer:observer,dispose:function(){observer.dispose();controller.dispose();}});
}
var api=Object.freeze({createController:createController,createObserver:createObserver,connect:connect});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else if(!root.ownedHorsePersistenceConnectionDraftV1)root.ownedHorsePersistenceConnectionDraftV1=api;
})(typeof globalThis!=='undefined'?globalThis:window);

/* Browser wiring draft. No automatic installation, no UI completeness claim. */
(function(root){
'use strict';
var installed=null;
function create(options){
  options=options||{};
  if(installed)throw new Error('保存接続は既に作成されています。');
  if(!root.ownedHorsePersistenceConnectionDraftV1||!root.ownedHorsePersistenceCoreDraftV1||
      typeof root.createOwnedHorseValidationIsolationDraftV1!=='function'||
      typeof backupJSON!=='function'||typeof doRestore!=='function'||typeof dirty!=='function'||
      typeof showList!=='function'||typeof REG==='undefined'||typeof seq==='undefined'||
      typeof editId==='undefined'||!root.document)throw new Error('接続に必要な既存処理が揃っていません。');
  var failures=[],disposed=false;
  function report(e){failures.push(e);if(typeof options.onError==='function'){try{options.onError(e);}catch(_){}}}
  var host={
    capturePayload:function(){return backupJSON();},
    getRegistry:function(){return REG;},
    getEditId:function(){return editId;},
    canApplyLoaded:function(){return REG.length===0&&!dirty();},
    applyLoaded:function(v){
      if(!v||!Array.isArray(v.records)||!Number.isInteger(v.nextSeq))throw new Error('読み戻し結果が不正です。');
      var oldRecords=REG,oldSeq=seq;
      try{REG=v.records;seq=Math.max(seq,v.nextSeq);showList(false);}
      catch(e){REG=oldRecords;seq=oldSeq;throw e;}
    }
  };
  var connection=root.ownedHorsePersistenceConnectionDraftV1.connect({
    coreAPI:root.ownedHorsePersistenceCoreDraftV1,
    isolationFactory:root.createOwnedHorseValidationIsolationDraftV1,
    indexedDB:options.indexedDB,dbName:options.dbName,host:host,
    onState:options.onState,onError:report
  });
  function click(e){
    var button=root.document.getElementById('reg');
    if(!button||(e.target!==button&&!(button.contains&&button.contains(e.target))))return;
    if(!connection.observer.registration()){e.preventDefault();e.stopImmediatePropagation();}
  }
  var previousRestore=doRestore;
  function wrappedRestore(){var that=this,args=arguments;return connection.observer.restore(function(){return previousRestore.apply(that,args);});}
  root.document.addEventListener('click',click,true);
  doRestore=wrappedRestore;
  var publicAPI=Object.freeze({start:connection.controller.start,retry:connection.controller.retry,
    getState:connection.controller.getState,errors:function(){return failures.slice();},
    dispose:function(){
      if(disposed)return;disposed=true;
      root.document.removeEventListener('click',click,true);
      if(doRestore===wrappedRestore)doRestore=previousRestore;
      connection.dispose();if(installed===publicAPI)installed=null;
    }});
  installed=publicAPI;return publicAPI;
}
if(!root.createOwnedHorsePersistenceBrowserDraftV1)root.createOwnedHorsePersistenceBrowserDraftV1=create;
})(typeof globalThis!=='undefined'?globalThis:window);

/* Owned horses persistence UI draft. Explicit installation only. */
(function(root){
'use strict';
function fail(message){return new Error(message);}
function describe(state,count){
  state=state||{};
  var phase=state.phase||'new',n=Number.isInteger(count)&&count>=0?String(count):'不明';
  var message,level='normal',retry=false;
  switch(phase){
    case 'new':case 'loading':message='端末内の保存データを確認しています。入力・確定操作は確認後に再開します。';break;
    case 'empty':message='端末内の保存データは見つかりません。初回利用か削除後かは判定していません。';break;
    case 'restored':message='端末内の保存データから'+n+'件を読み戻しました。';break;
    case 'saving':message='登録済みの確定内容を端末内に保存しています。';break;
    case 'saved':
      if(state.startupFinished&&Number.isInteger(count)&&count>=0&&Number.isSafeInteger(state.latestRequest)&&state.latestRequest>0&&state.latestRequest===state.confirmedRequest)message='登録済み'+n+'件を端末内に保存しました。';
      else{message='新しい確定内容の保存は、まだ確認できていません。';level='warning';}
      break;
    case 'unchanged':message='前回確認した内容と同じため、今回の書き込みは行っていません。現在の保存領域を再照合した表示ではありません。';break;
    case 'failed':message='今回の確定内容を端末内に保存できませんでした。このタブを閉じず、再保存または可能な場合はJSONバックアップを書き出してください。';level='warning';retry=!!state.startupFinished;break;
    case 'blocked':
      if(state.errorCode==='CONFLICT')message='別の操作で端末内の保存内容が更新されたため、上書きを止めました。自動で統合・再読み込みはしません。';
      else if(state.errorCode==='SAVE_UNCONFIRMED')message='保存結果を確認できません。上書きを避けるため、追加の保存を停止しました。このタブを閉じないでください。';
      else if(state.errorCode==='RESTORE_GUARD')message='画面内に一覧または入力があるため、読み戻しと追加の保存を止めました。入力を破棄していません。';
      else message='読み戻しまたは検証で異常があったため、端末内への保存を停止しています。保存データを自動削除・上書きしません。';
      level='warning';break;
    case 'closed':message='保存機能との接続は終了しています。端末内保存は行いません。';level='warning';break;
    default:message='保存状態を確認できません。安全のため操作を待機しています。';level='warning';
  }
  var known=['new','loading','empty','restored','saving','saved','unchanged','failed','blocked','closed'].indexOf(phase)>=0;
  var locked=!known||!state.startupFinished||phase==='closed';
  return {message:message,level:level,locked:locked,canRetry:retry&&!locked};
}
function create(options){
  if(!options||!options.document||!Array.isArray(options.roots)||options.roots.length===0||
      typeof options.getCount!=='function'||typeof options.retry!=='function')throw fail('UIの接続先を明示してください。');
  var doc=options.document,roots=options.roots.slice(),parent=roots[0]&&roots[0].parentNode;
  if(!parent||roots.some(function(el,i){return !el||el.parentNode!==parent||roots.indexOf(el)!==i;}))throw fail('画面ルートの親要素または指定が不正です。');
  roots.sort(function(a,b){return Array.prototype.indexOf.call(parent.childNodes,a)-Array.prototype.indexOf.call(parent.childNodes,b);});
  if(doc.getElementById('owned-horse-persistence-ui-draft-v1'))throw fail('保存状態UIは既に作成されています。');
  if(roots.some(function(el){return !el.matches||!el.matches('#s0, #s1, #s2, #s3');}))throw fail('所有馬の画面ルート以外は囲みません。');
  var panel=doc.createElement('section'),status=doc.createElement('p'),note=doc.createElement('p'),button=doc.createElement('button');
  var gate=doc.createElement('fieldset'),markers=[],disposed=false,retryBusy=false,current={phase:'new',startupFinished:false};
  panel.id='owned-horse-persistence-ui-draft-v1';
  panel.style.cssText='margin:0 0 12px;padding:12px;border:1px solid var(--border);border-radius:8px;';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  status.style.cssText='margin:0 0 8px;font-size:14px;white-space:pre-wrap;';
  note.textContent='端末内保存とJSONバックアップファイルの取得は別です。端末内保存は消失しない保証ではありません。未登録入力・未確定編集・推定結果は保存対象外です。';
  note.style.cssText='margin:0 0 8px;font-size:13px;color:var(--text-secondary);';
  button.type='button';button.textContent='登録済みの確定内容を再保存';button.style.cssText='min-height:44px;font-size:15px;';
  panel.appendChild(status);panel.appendChild(note);panel.appendChild(button);
  gate.disabled=true;gate.style.cssText='border:0;margin:0;padding:0;min-width:0;';
  var appBusy=parent.getAttribute('aria-busy');
  function mount(){
    parent.insertBefore(panel,roots[0]);parent.insertBefore(gate,roots[0]);
    roots.forEach(function(el){var marker=doc.createComment('persistence-ui-root');parent.insertBefore(marker,el);markers.push(marker);gate.appendChild(el);});
  }
  function render(){
    if(disposed)return;
    var count;try{count=options.getCount();}catch(_){count=null;}
    var model=describe(current,count);
    status.textContent=model.message;panel.setAttribute('data-save-level',model.level);
    status.style.color=model.level==='warning'?'var(--text-danger)':'var(--text)';
    gate.disabled=model.locked;
    parent.setAttribute('aria-busy',current.phase==='new'||current.phase==='loading'?'true':'false');
    button.hidden=!model.canRetry;button.disabled=!model.canRetry||retryBusy;
    panel.setAttribute('data-save-phase',current.phase||'new');
  }
  async function retryClick(){
    if(disposed||retryBusy||!describe(current,0).canRetry)return;
    retryBusy=true;render();
    try{await options.retry();}
    catch(e){if(typeof options.onError==='function'){try{options.onError(e);}catch(_){}}}
    finally{retryBusy=false;render();}
  }
  button.addEventListener('click',retryClick);
  function update(state){if(disposed)return;current=Object.assign({},state);render();}
  function dispose(){
    if(disposed)return;disposed=true;button.removeEventListener('click',retryClick);
    roots.forEach(function(el,i){var marker=markers[i];if(marker&&marker.parentNode===parent){parent.insertBefore(el,marker);parent.removeChild(marker);}});
    if(gate.parentNode===parent)parent.removeChild(gate);
    if(panel.parentNode===parent)parent.removeChild(panel);
    if(appBusy===null)parent.removeAttribute('aria-busy');else parent.setAttribute('aria-busy',appBusy);
  }
  try{mount();button.addEventListener('click',retryClick);render();}
  catch(e){try{dispose();}catch(cleanupError){e.cleanupError=cleanupError;}throw e;}
  return Object.freeze({update:update,refresh:render,dispose:dispose,
    elements:Object.freeze({panel:panel,status:status,note:note,retry:button,gate:gate})});
}
var api=Object.freeze({describe:describe,create:create});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else if(!root.ownedHorsePersistenceUIDraftV1)root.ownedHorsePersistenceUIDraftV1=api;
})(typeof globalThis!=='undefined'?globalThis:window);

/* Exact legacy notice replacement draft. Does not determine persistence success. */
(function(root){
'use strict';
var instances=new WeakMap();
var COPY=[
 ['登録内容は未保存です（この画面を開いている間だけ保持され、再読み込みすると消えます）','登録済みの確定内容を表示しています。端末内保存の状態は上部の保存状態欄で確認してください。'],
 ['登録時点の内容です。未保存（この画面を開いている間だけ保持）','登録・変更反映で確定した内容です。端末内保存の状態は上部の保存状態欄で確認してください。'],
 ['登録しただけではファイルに保存されません。復元には書き出したバックアップが必要です。','JSONバックアップは端末内保存とは別です。書き出し後は、iPhoneでファイルを取得できたことを確認してください。'],
 ['この試作は入力データを永続保存しません','未登録の入力・未確定の編集内容は保存対象外です。'],
 ['登録しただけでは保存されません。再読み込みすると画面内のデータは消えますが、書き出したバックアップから復元できます。','確定操作後に端末内保存を試みます。成否は上部の保存状態欄で確認してください。未確定の内容は保存しません。'],
 ['「復元する」を押すと、全件をまとめて一覧に復元します（未保存の状態になります）。','「復元する」を押すと、全件をまとめて一覧に復元します。復元後の端末内保存の成否は上部で確認してください。']
];
function create(options){
 if(!options||!options.document||!options.functions)throw new Error('文言整理の接続先を明示してください。');
 var doc=options.document,host=options.functions,names=['resetAll','showList','showDetail','showImportPreview'];
 if(instances.has(host))throw new Error('案内文言の接続は既に作成されています。');
 if(!doc.getElementById('owned-horse-persistence-ui-draft-v1'))throw new Error('保存状態欄を先に作成してください。');
 if(names.some(function(k){return typeof host[k]!=='function';}))throw new Error('既存の画面処理を確認できません。');
 var changes=new Map(),originals={},wrappers={},errors=[],disposed=false;
 function replace(node,text){
  if(!node||node.textContent===text)return;
  var previous=changes.get(node);
  if(!previous||node.textContent!==previous.after)previous={before:node.textContent,after:text};
  else previous.after=text;
  changes.set(node,previous);node.textContent=text;
 }
 function paragraphs(el){return el?Array.prototype.filter.call(el.children,function(n){return n.tagName==='P';}):[];}
 function rewriteFixed(node){for(var i=0;i<COPY.length;i++)if(node.textContent===COPY[i][0]){replace(node,COPY[i][1]);return;}}
 function refresh(){
  if(disposed)return;
  var targets=[];
  ['s0','s3','s1','s2'].forEach(function(id){targets=targets.concat(paragraphs(doc.getElementById(id)));});
  var exp=doc.getElementById('bexp'),backup=exp&&exp.parentNode&&exp.parentNode.parentNode;
  targets=targets.concat(paragraphs(backup),paragraphs(doc.getElementById('imp')));
  targets.forEach(rewriteFixed);
  var button=doc.getElementById('reg');
  if(button&&button.textContent==='一覧へ登録（今回のみ）')replace(button,'一覧へ登録');
  var flash=doc.getElementById('flash');
  if(flash){
   if(flash.textContent==='登録しました（未保存）')replace(flash,'一覧へ登録しました。端末内保存の成否は上部で確認してください。');
   else if(flash.textContent==='変更を反映しました。ファイルには未保存です。バックアップを書き出してください。')replace(flash,'変更を一覧へ反映しました。端末内保存の成否は上部で確認してください。');
   else {var m=/^バックアップから([0-9]+)件を復元しました（未保存）$/.exec(flash.textContent);if(m)replace(flash,'バックアップから'+m[1]+'件を一覧に復元しました。端末内保存の成否は上部で確認してください。');}
  }
 }
 function safeRefresh(){try{refresh();}catch(e){errors.push(e);if(typeof options.onError==='function'){try{options.onError(e);}catch(_){}}}}
 names.forEach(function(name){
  originals[name]=host[name];
  wrappers[name]=function(){try{return originals[name].apply(this,arguments);}finally{safeRefresh();}};
  host[name]=wrappers[name];
 });
 function dispose(){
  if(disposed)return;disposed=true;
  names.forEach(function(name){if(host[name]===wrappers[name])host[name]=originals[name];});
  changes.forEach(function(change,node){if(node.textContent===change.after)node.textContent=change.before;});
  changes.clear();instances.delete(host);
 }
 var api=Object.freeze({refresh:safeRefresh,errors:function(){return errors.slice();},dispose:dispose});
 instances.set(host,api);safeRefresh();return api;
}
var api=Object.freeze({create:create});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else if(!root.ownedHorsePersistenceNoticesDraftV1)root.ownedHorsePersistenceNoticesDraftV1=api;
})(typeof globalThis!=='undefined'?globalThis:window);

/* Comparison-page bootstrap: no writes occur until a confirmed operation. */
(function(root){
'use strict';
if(root.ownedHorsePersistencePreviewV1)return;
var instance=null;
function boot(){
 if(instance)return instance;
 var connection=null,view=null,notices=null,trace=[],issues=[],phase='setting-up';
 function mark(x){trace.push(x);}
 function report(e){issues.push(e&&e.code||'ERROR');if(issues.length>20)issues.shift();}
 function releasePreload(){var gate=root.document.getElementById('owned-horse-persistence-preload-gate-v1');if(gate)gate.disabled=false;}
 function fallback(){
  var doc=root.document,id='owned-horse-persistence-setup-error-v1',p=doc.getElementById(id);
  if(!p){p=doc.createElement('p');p.id=id;p.style.cssText='padding:12px;border:1px solid var(--text-danger);color:var(--text-danger);';doc.body.insertBefore(p,doc.body.firstChild);}
  p.textContent='保存機能の試作を起動できません。端末内保存は開始していません。画面内の入力や既存JSONを削除する操作は行っていません。';
 }
 var resolveReady;
 var ready=new Promise(function(resolve){resolveReady=resolve;});
 instance=Object.freeze({ready:ready,getPhase:function(){return phase;},getState:function(){return connection?connection.getState():null;},
  trace:function(){return trace.slice();},errorCodes:function(){return issues.slice();}});
 try{
  mark('preflight');
  if(!root.document)throw new Error('document is required');
  if(root.__ownedHorsePersistenceDependencyGuardV1){
   var guard=root.__ownedHorsePersistenceDependencyGuardV1;
   root.removeEventListener('error',guard.listener,true);
   if(guard.failed)throw new Error('dependency failed');
  }
  ['ownedHorsePersistenceCoreDraftV1','ownedHorseValidationIsolationDraftV1','ownedHorsePersistenceConnectionDraftV1','ownedHorsePersistenceUIDraftV1','ownedHorsePersistenceNoticesDraftV1'].forEach(function(k){if(!root[k])throw new Error('required API missing');});
  var roots=['s0','s3','s1','s2'].map(function(id){return root.document.getElementById(id);});
  if(roots.some(function(el){return !el;}))throw new Error('screen root missing');
  mark('connection-create');
  connection=root.createOwnedHorsePersistenceBrowserDraftV1({onState:function(s){if(view)view.update(s);},onError:report});
  mark('ui-create');
  view=root.ownedHorsePersistenceUIDraftV1.create({document:root.document,roots:roots,getCount:function(){return REG.length;},retry:function(){return connection.retry();},onError:report});
  mark('notices-create');
  notices=root.ownedHorsePersistenceNoticesDraftV1.create({document:root.document,functions:root,onError:report});
  if(notices.errors().length)throw new Error('notice initialization failed');
  releasePreload();mark('preload-release');
  Promise.resolve().then(function(){phase='loading';mark('load-start');return connection.start();}).then(function(){
   view.update(connection.getState());phase='ready';mark('load-finished');resolveReady({ok:true});
  }).catch(function(e){
   report(e);phase='blocked';mark('load-blocked');
   if(view){try{view.update(connection.getState());}catch(renderError){report(renderError);}}
   resolveReady({ok:false,stage:'load',code:e&&e.code||'ERROR'});
  });
 }catch(e){
  report(e);phase='setup-failed';mark('setup-failed');
  if(notices){try{notices.dispose();mark('notices-dispose');}catch(x){report(x);}}
  if(view){try{view.dispose();mark('ui-dispose');}catch(x){report(x);}}
  if(connection){try{connection.dispose();mark('connection-dispose');}catch(x){report(x);}}
  try{releasePreload();fallback();}catch(x){report(x);}
  resolveReady({ok:false,stage:'setup',code:e&&e.code||'ERROR'});
 }
 return instance;
}
root.ownedHorsePersistencePreviewV1=Object.freeze({boot:boot});
var script=root.document&&root.document.currentScript;
if(script&&script.getAttribute('data-owned-horse-persistence')==='preview-v1')boot();
})(typeof globalThis!=='undefined'?globalThis:window);
