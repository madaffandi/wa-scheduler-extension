const STORAGE_KEY = "wa_scheduler_jobs";
const ALARM_PREFIX = "wa_job_";

chrome.runtime.onInstalled.addListener(async () => {
  await syncAlarmsFromStorage();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncAlarmsFromStorage();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  const jobId = alarm.name.replace(ALARM_PREFIX, "");
  const job = await getJob(jobId);

  if (!job || job.status !== "scheduled") return;

  // Claim the job before sending. This prevents duplicate sends when Chrome fires
  // the same alarm again after reload/startup or when multiple listeners exist.
  await updateJob(jobId, {
    status: "sending",
    startedAt: new Date().toISOString(),
    lastError: ""
  });
  await chrome.alarms.clear(ALARM_PREFIX + jobId);

  try {
    await sendScheduledMessage(job);
    await updateJob(jobId, {
      status: "sent",
      sentAt: new Date().toISOString(),
      lastError: ""
    });
    notify("WA Scheduler", `Message sent to ${job.groupName}`);
  } catch (error) {
    await updateJob(jobId, {
      status: "failed",
      lastError: error.message || String(error)
    });
    notify("WA Scheduler failed", error.message || String(error));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "SCHEDULE_JOB") {
      const job = message.payload;
      await saveJob(job);
      await createAlarm(job);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GET_JOBS") {
      const jobs = await getJobs();
      sendResponse({ ok: true, jobs });
      return;
    }

    if (message.type === "DELETE_JOB") {
      await deleteJob(message.jobId);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "TEST_SEND") {
      await sendScheduledMessage(message.payload);
      sendResponse({ ok: true });
      return;
    }
  })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function sendScheduledMessage(job) {
  const tab = await getOrCreateWhatsAppTab();

  if (tab.discarded) {
    await chrome.tabs.update(tab.id, { active: false });
  }

  await waitForTabComplete(tab.id, 45000);

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "SEND_WHATSAPP_MESSAGE",
    payload: {
      groupName: job.groupName,
      message: job.message
    }
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "Content script failed to send the message.");
  }
}

async function getOrCreateWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length > 0) return tabs[0];

  const tab = await chrome.tabs.create({ url: "https://web.whatsapp.com/", active: false });
  return tab;
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("WhatsApp Web took too long to load."));
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeout);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (tab.status === "complete") {
        clearTimeout(timeout);
        resolve();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function syncAlarmsFromStorage() {
  const jobs = await getJobs();
  const now = Date.now();

  for (const job of jobs) {
    if (job.status === "scheduled" && new Date(job.scheduleAt).getTime() > now) {
      await createAlarm(job);
    }
  }
}

async function createAlarm(job) {
  const when = new Date(job.scheduleAt).getTime();
  if (!Number.isFinite(when) || when <= Date.now()) {
    throw new Error("Schedule time must be in the future.");
  }
  await chrome.alarms.create(ALARM_PREFIX + job.id, { when });
}

async function getJobs() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function getJob(jobId) {
  const jobs = await getJobs();
  return jobs.find((job) => job.id === jobId);
}

async function saveJob(job) {
  const jobs = await getJobs();
  const withoutSameId = jobs.filter((existing) => existing.id !== job.id);
  withoutSameId.push(job);
  await chrome.storage.local.set({ [STORAGE_KEY]: withoutSameId });
}

async function updateJob(jobId, patch) {
  const jobs = await getJobs();
  const updated = jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job);
  await chrome.storage.local.set({ [STORAGE_KEY]: updated });
}

async function deleteJob(jobId) {
  const jobs = await getJobs();
  const filtered = jobs.filter((job) => job.id !== jobId);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  await chrome.alarms.clear(ALARM_PREFIX + jobId);
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message
  });
}
