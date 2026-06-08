const $ = (id) => document.getElementById(id);

const version = $('version');
if (version) {
  version.textContent = `v${chrome.runtime.getManifest().version}`;
}

$('scheduleBtn').addEventListener('click', async () => {
  const job = buildJob();
  if (!job) return;

  const result = await sendMessage({ type: 'SCHEDULE_JOB', payload: job });
  showStatus(result.ok ? 'Scheduled successfully.' : result.error, result.ok);
  await loadJobs();
});

$('testBtn').addEventListener('click', async () => {
  const groupName = $('groupName').value.trim();
  const message = $('message').value.trim();

  if (!groupName || !message) {
    showStatus('Group name and message are required.', false);
    return;
  }

  const result = await sendMessage({
    type: 'TEST_SEND',
    payload: { groupName, message }
  });

  showStatus(result.ok ? 'Test message sent.' : result.error, result.ok);
});

function buildJob() {
  const groupName = $('groupName').value.trim();
  const message = $('message').value.trim();
  const scheduleAtValue = $('scheduleAt').value;

  if (!groupName || !message || !scheduleAtValue) {
    showStatus('Group name, message, and schedule time are required.', false);
    return null;
  }

  const scheduleAt = new Date(scheduleAtValue);
  if (scheduleAt.getTime() <= Date.now()) {
    showStatus('Schedule time must be in the future.', false);
    return null;
  }

  return {
    id: crypto.randomUUID(),
    groupName,
    message,
    scheduleAt: scheduleAt.toISOString(),
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    lastError: ''
  };
}

async function loadJobs() {
  const result = await sendMessage({ type: 'GET_JOBS' });
  const jobs = result.jobs || [];
  const container = $('jobs');

  if (jobs.length === 0) {
    container.innerHTML = '<p class="muted">No jobs yet.</p>';
    return;
  }

  container.innerHTML = jobs
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((job) => `
      <div class="job">
        <strong>${escapeHtml(job.groupName)}</strong>
        <span>${escapeHtml(job.status)}</span>
        <small>${new Date(job.scheduleAt).toLocaleString()}</small>
        ${job.lastError ? `<em>${escapeHtml(job.lastError)}</em>` : ''}
        <button data-delete="${job.id}" class="danger">Delete</button>
      </div>
    `).join('');

  container.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      await sendMessage({ type: 'DELETE_JOB', jobId: button.dataset.delete });
      await loadJobs();
    });
  });
}

function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

function showStatus(text, ok) {
  const status = $('status');
  status.textContent = text;
  status.className = ok ? 'ok' : 'error';
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[char]));
}

loadJobs();
