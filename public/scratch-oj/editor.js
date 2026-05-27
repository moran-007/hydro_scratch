(function () {
  const root = document.getElementById('scratch-oj-editor-root');
  if (!root) return;

  const config = JSON.parse(root.dataset.config || '{}');
  const frame = document.getElementById('scratch-oj-frame');
  const saveButton = document.getElementById('scratch-oj-save');
  const submitButton = document.getElementById('scratch-oj-submit');
  const statusNode = document.getElementById('scratch-oj-status');
  let projectList = document.getElementById('scratch-oj-projects');
  const emptyProjects = document.getElementById('scratch-oj-empty-projects');
  let currentProjectId = config.projectId || '';
  let pendingExport = null;

  function setStatus(message, isError) {
    statusNode.innerHTML = message;
    statusNode.style.color = isError ? '#c62828' : '#555';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureProjectList() {
    if (projectList) return projectList;
    if (!emptyProjects || !emptyProjects.parentNode) return null;
    const list = document.createElement('ul');
    list.id = 'scratch-oj-projects';
    list.className = 'scratch-oj-list';
    emptyProjects.parentNode.replaceChild(list, emptyProjects);
    projectList = list;
    return projectList;
  }

  function prependProject(result) {
    const list = ensureProjectList();
    if (!list || !result || !result.project) return;
    const item = document.createElement('li');
    const label = result.project.status === 'submitted' ? '已提交' : '草稿';
    const recordLinks = result.recordUrl
      ? ` <a class="scratch-oj-inline-link" href="${escapeHtml(result.recordUrl)}">测评记录</a>`
      : '';
    item.innerHTML = `<a href="${escapeHtml(result.downloadUrl)}">${escapeHtml(result.project.filename)}</a> <span class="scratch-oj-muted">${label}</span>${recordLinks}`;
    list.insertBefore(item, list.firstChild);
  }

  function getEditorOrigin() {
    try {
      return new URL(config.editorUrl, window.location.href).origin;
    } catch (error) {
      return window.location.origin;
    }
  }

  function postToEditor(payload) {
    if (!frame.contentWindow) {
      setStatus('编辑器还没有准备好。', true);
      return;
    }
    frame.contentWindow.postMessage(payload, getEditorOrigin());
  }

  function requestExport(operation) {
    const requestId = `${operation}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pendingExport = {
      operation,
      requestId,
      timer: window.setTimeout(() => {
        if (pendingExport && pendingExport.requestId === requestId) {
          setStatus('编辑器未响应导出请求，请刷新页面后重试。', true);
          pendingExport = null;
        }
      }, 12000),
    };
    setStatus(operation === 'submit' ? '正在导出并提交作品...' : '正在导出并保存草稿...');
    postToEditor({
      type: 'SCRATCH_OJ_EXPORT_SB3',
      requestId,
      operation,
    });
  }

  async function uploadProject(operation, filename, content, title) {
    if (!content) {
      setStatus('没有收到 Scratch 项目文件。', true);
      return;
    }
    const form = new FormData();
    const finalFilename = filename || `${config.problemId || 'scratch-project'}.sb3`;
    form.append('operation', operation);
    form.append('projectId', currentProjectId);
    form.append('title', title || finalFilename.replace(/\.sb3$/i, ''));
    form.append('file', new Blob([content], { type: 'application/octet-stream' }), finalFilename);

    const response = await fetch(config.uploadUrl, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      body: form,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (error) {
      throw new Error(`服务器没有返回 JSON：${text.slice(0, 120)}`);
    }
    if (!result.ok) throw new Error(result.error || '服务器保存失败');

    currentProjectId = result.project && result.project._id ? result.project._id : currentProjectId;
    config.latestDownloadUrl = result.downloadUrl || config.latestDownloadUrl;
    prependProject(result);

    const downloadLink = `<a href="${escapeHtml(result.downloadUrl)}">下载本次作品</a>`;
    const recordLink = result.recordUrl
      ? ` / <a href="${escapeHtml(result.recordUrl)}">查看 Hydro 测评记录</a>`
      : '';
    setStatus(`${operation === 'submit' ? '作品已提交' : '草稿已保存'}：${downloadLink}${recordLink}`);
  }

  function finishPendingExport() {
    if (pendingExport && pendingExport.timer) window.clearTimeout(pendingExport.timer);
    pendingExport = null;
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== getEditorOrigin()) return;
    const data = event.data || {};

    if (data.type === 'SCRATCH_OJ_LOAD_SUCCESS') {
      setStatus(data.filename ? `已加载作品：${escapeHtml(data.filename)}` : '编辑器已准备好。');
      return;
    }

    if (data.type === 'SCRATCH_OJ_LOAD_ERROR' || data.type === 'SCRATCH_OJ_SUBMIT_ERROR' || data.type === 'SCRATCH_OJ_EXPORT_SB3_ERROR') {
      finishPendingExport();
      setStatus(data.message || 'Scratch 编辑器操作失败。', true);
      return;
    }

    if (data.type === 'SCRATCH_OJ_SUBMIT_SB3') {
      uploadProject('submit', data.filename, data.content, data.title).catch((error) => {
        setStatus(`提交失败：${escapeHtml(error.message)}`, true);
      });
      return;
    }

    if (data.type === 'SCRATCH_OJ_EXPORT_SB3_RESULT') {
      if (!pendingExport || data.requestId !== pendingExport.requestId) return;
      const operation = pendingExport.operation;
      finishPendingExport();
      uploadProject(operation, data.filename, data.content, data.title).catch((error) => {
        setStatus(`${operation === 'submit' ? '提交' : '保存'}失败：${escapeHtml(error.message)}`, true);
      });
    }
  });

  function loadLatestProject() {
    if (!config.latestDownloadUrl) return;
    fetch(config.latestDownloadUrl, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((content) => {
        postToEditor({
          type: 'SCRATCH_OJ_LOAD_SB3',
          requestId: `load-${Date.now()}`,
          filename: 'latest.sb3',
          content,
        });
      })
      .catch((error) => {
        setStatus(`历史作品加载失败：${escapeHtml(error.message)}`, true);
      });
  }

  frame.addEventListener('load', () => {
    setStatus('编辑器已加载。');
    window.setTimeout(loadLatestProject, 1200);
  });

  saveButton.addEventListener('click', () => requestExport('draft'));
  submitButton.addEventListener('click', () => requestExport('submit'));
})();
