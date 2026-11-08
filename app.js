"use strict";

(function () {
  var STATUSES = ["計画", "予約", "実行済み"];
  var DEFAULT_STATUS = "計画";

  // 試作段階のため、データはメモリ内のみに保持する（再読み込みで消える）。
  var plans = [];
  var sequence = 0;
  // 同一ミリ秒内に複数の登録・更新があっても、後の操作が一覧の上に来るようにする。
  var changeOrder = 0;
  var initialFormValues = null;
  var editingId = null;

  var listScreen = document.getElementById("list-screen");
  var formScreen = document.getElementById("form-screen");
  var listHeading = document.getElementById("list-heading");
  var formHeading = document.getElementById("form-heading");
  var formMode = document.getElementById("form-mode");
  var formDescription = document.getElementById("form-description");
  var submitButton = document.getElementById("submit-button");
  var newButton = document.getElementById("new-button");
  var cancelButton = document.getElementById("cancel-button");
  var form = document.getElementById("plan-form");
  var nameInput = document.getElementById("plan-name");
  var sireInput = document.getElementById("plan-sire");
  var damInput = document.getElementById("plan-dam");
  var statusInput = document.getElementById("plan-status");
  var memoInput = document.getElementById("plan-memo");
  var nameError = document.getElementById("plan-name-error");
  var planList = document.getElementById("plan-list");
  var emptyMessage = document.getElementById("empty-message");
  var resultMessage = document.getElementById("result-message");

  if (!listScreen || !formScreen || !form || !planList || !submitButton) {
    return;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateTime(date) {
    return (
      date.getFullYear() + "/" + pad(date.getMonth() + 1) + "/" + pad(date.getDate()) +
      " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds())
    );
  }

  function createId() {
    sequence += 1;
    return "plan-" + Date.now().toString(36) + "-" + sequence;
  }

  function nextChangeOrder() {
    changeOrder += 1;
    return changeOrder;
  }

  function normalizeStatus(value) {
    return STATUSES.indexOf(value) >= 0 ? value : DEFAULT_STATUS;
  }

  function findPlanById(id) {
    for (var i = 0; i < plans.length; i += 1) {
      if (plans[i].id === id) {
        return plans[i];
      }
    }
    return null;
  }

  function readFormValues() {
    return {
      name: nameInput.value,
      sire: sireInput.value,
      dam: damInput.value,
      status: statusInput.value,
      memo: memoInput.value
    };
  }

  function writeFormValues(values) {
    nameInput.value = values.name;
    sireInput.value = values.sire;
    damInput.value = values.dam;
    statusInput.value = normalizeStatus(values.status);
    memoInput.value = values.memo;
  }

  function isFormChanged() {
    if (!initialFormValues) {
      return false;
    }
    var current = readFormValues();
    return Object.keys(current).some(function (key) {
      return current[key] !== initialFormValues[key];
    });
  }

  function clearNameError() {
    nameError.hidden = true;
    nameInput.removeAttribute("aria-invalid");
  }

  function renderList() {
    while (planList.firstChild) {
      planList.removeChild(planList.firstChild);
    }

    var sorted = plans.slice().sort(function (a, b) {
      if (b.updatedAt !== a.updatedAt) {
        return b.updatedAt - a.updatedAt;
      }
      return b.changeOrder - a.changeOrder;
    });

    sorted.forEach(function (plan) {
      var item = document.createElement("li");
      item.className = "plan-item";

      var row = document.createElement("div");
      row.className = "plan-row";

      var body = document.createElement("div");
      body.className = "plan-body";

      var name = document.createElement("p");
      name.className = "plan-name";
      name.textContent = plan.name;

      var meta = document.createElement("p");
      meta.className = "plan-meta";

      var status = document.createElement("span");
      status.className = "plan-status";
      status.textContent = plan.status;

      var updated = document.createElement("span");
      updated.textContent = "更新：" + formatDateTime(new Date(plan.updatedAt));

      var editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "button button-secondary button-small";
      editButton.textContent = "編集";
      editButton.setAttribute("aria-label", "「" + plan.name + "」を編集");
      editButton.dataset.planId = plan.id;

      meta.appendChild(status);
      meta.appendChild(updated);
      body.appendChild(name);
      body.appendChild(meta);
      row.appendChild(body);
      row.appendChild(editButton);
      item.appendChild(row);
      planList.appendChild(item);
    });

    emptyMessage.hidden = plans.length > 0;
    planList.hidden = plans.length === 0;
  }

  function showList() {
    formScreen.hidden = true;
    listScreen.hidden = false;
    initialFormValues = null;
    editingId = null;
    window.scrollTo(0, 0);
    listHeading.focus();
  }

  function openForm() {
    resultMessage.textContent = "";
    clearNameError();
    initialFormValues = readFormValues();
    listScreen.hidden = true;
    formScreen.hidden = false;
    window.scrollTo(0, 0);
    formHeading.focus();
  }

  function showCreateForm() {
    editingId = null;
    form.reset();
    statusInput.value = DEFAULT_STATUS;
    formMode.textContent = "新規";
    formMode.className = "mode-badge mode-new";
    formHeading.textContent = "新規作成";
    formDescription.textContent = "新しい計画を一覧に登録します。";
    submitButton.textContent = "一覧に登録";
    openForm();
  }

  function showEditForm(id) {
    var plan = findPlanById(id);
    if (!plan) {
      resultMessage.textContent = "対象の計画が見つかりませんでした。";
      return;
    }
    editingId = plan.id;
    form.reset();
    // 入力欄には値の写しだけを入れ、確定するまで元の計画は変更しない。
    writeFormValues({
      name: plan.name,
      sire: plan.sire,
      dam: plan.dam,
      status: plan.status,
      memo: plan.memo
    });
    formMode.textContent = "編集";
    formMode.className = "mode-badge mode-edit";
    formHeading.textContent = "計画を編集";
    formDescription.textContent = "編集中：「" + plan.name + "」　作成：" + formatDateTime(new Date(plan.createdAt));
    submitButton.textContent = "変更を反映";
    openForm();
  }

  function registerPlan(values) {
    var now = Date.now();
    var plan = {
      id: createId(),
      sequence: sequence,
      changeOrder: nextChangeOrder(),
      name: values.name.trim(),
      sire: values.sire,
      dam: values.dam,
      status: normalizeStatus(values.status),
      memo: values.memo,
      createdAt: now,
      updatedAt: now
    };
    plans.push(plan);
    return plan;
  }

  function updatePlan(id, values) {
    var plan = findPlanById(id);
    if (!plan) {
      return null;
    }
    plan.name = values.name.trim();
    plan.sire = values.sire;
    plan.dam = values.dam;
    plan.status = normalizeStatus(values.status);
    plan.memo = values.memo;
    plan.updatedAt = Math.max(Date.now(), plan.updatedAt);
    plan.changeOrder = nextChangeOrder();
    return plan;
  }

  newButton.addEventListener("click", showCreateForm);

  planList.addEventListener("click", function (event) {
    var target = event.target;
    var button = target && target.closest ? target.closest("button[data-plan-id]") : null;
    if (!button || !planList.contains(button)) {
      return;
    }
    showEditForm(button.dataset.planId);
  });

  nameInput.addEventListener("input", function () {
    if (nameInput.value.trim() !== "") {
      clearNameError();
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var values = readFormValues();

    if (values.name.trim() === "") {
      nameError.hidden = false;
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      return;
    }

    if (editingId !== null) {
      var updated = updatePlan(editingId, values);
      renderList();
      showList();
      resultMessage.textContent = updated
        ? "「" + updated.name + "」の変更を反映しました。"
        : "対象の計画が見つからなかったため、変更を反映できませんでした。";
      return;
    }

    var plan = registerPlan(values);
    renderList();
    showList();
    resultMessage.textContent = "「" + plan.name + "」を一覧に登録しました。";
  });

  cancelButton.addEventListener("click", function () {
    if (isFormChanged()) {
      var message = editingId !== null
        ? "変更内容を破棄して一覧に戻りますか？（元の計画は変更されません）"
        : "入力内容を破棄して一覧に戻りますか？";
      if (!window.confirm(message)) {
        return;
      }
    }
    showList();
  });

  renderList();
})();