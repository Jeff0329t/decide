// Install this PRIVATE script while signed into the dedicated sending Gmail account.
// Set secrets in Project Settings > Script properties, never in this source.
function workerConfig_() {
  var props = PropertiesService.getScriptProperties();
  var config = {
    url: props.getProperty('WORKER_URL') || '',
    secret: props.getProperty('WORKER_SECRET') || '',
    sender: (props.getProperty('SENDER_EMAIL') || '').toLowerCase(),
    enabled: props.getProperty('SEND_ENABLED') === 'true'
  };
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/send-email-reminders$/.test(config.url) || !config.secret || !/^[^\s<>@]+@gmail\.com$/.test(config.sender)) {
    throw new Error('Set WORKER_URL, WORKER_SECRET and SENDER_EMAIL in Script properties.');
  }
  if(Session.getEffectiveUser().getEmail().toLowerCase() !== config.sender) {
    throw new Error('Run this script and create its trigger using the dedicated sending account.');
  }
  return config;
}

function workerRequest_(config, action, fields) {
  var response = UrlFetchApp.fetch(config.url, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-worker-secret': config.secret },
    payload: JSON.stringify(Object.assign({ action: action, sender: config.sender }, fields || {})),
    muteHttpExceptions: true, followRedirects: false
  });
  if(response.getResponseCode() !== 200) throw new Error('Mail worker request failed (' + response.getResponseCode() + ', ' + action + ').');
  return JSON.parse(response.getContentText());
}

// Safe connection/quota check: does NOT claim jobs or send any email.
function checkConnection() {
  var config = workerConfig_();
  var status = workerRequest_(config, 'status');
  console.log(JSON.stringify({ connected: status.ok === true, serverEnabled: status.enabled === true,
    sendingEnabled: config.enabled, remainingRecipients: MailApp.getRemainingDailyQuota() }));
}

// Installs one trigger for this account. Sending stays disabled until explicitly enabled.
function installTrigger() {
  checkConnection();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if(trigger.getHandlerFunction() === 'runReminders') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('runReminders').timeBased().everyMinutes(5).create();
  console.log('Trigger installed. It runs every five minutes.');
}

function enableSending() {
  var config = workerConfig_();
  if(workerRequest_(config, 'status').enabled !== true) throw new Error('Enable the server worker first.');
  PropertiesService.getScriptProperties().setProperty('SEND_ENABLED', 'true');
  console.log('Sending enabled. Future trigger runs can send actual reminder emails.');
}

function disableSending() {
  PropertiesService.getScriptProperties().setProperty('SEND_ENABLED', 'false');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if(trigger.getHandlerFunction() === 'runReminders') ScriptApp.deleteTrigger(trigger);
  });
  console.log('Sending disabled and reminder triggers removed.');
}

function runReminders() {
  if(PropertiesService.getScriptProperties().getProperty('SEND_ENABLED') !== 'true') return;
  var lock = LockService.getScriptLock();
  if(!lock.tryLock(1000)) return;
  try {
    var config = workerConfig_();
    var quota = MailApp.getRemainingDailyQuota();
    if(quota < 1) { console.log('Daily recipient quota exhausted; no jobs claimed.'); return; }
    var started = Date.now();
    var jobs = workerRequest_(config, 'claim').jobs || [];
    var sent = 0, uncertain = 0;
    for(var i = 0; i < jobs.length && i < 20; i++) {
      // Leave time for completion requests inside Apps Script's execution limit.
      if(Date.now() - started > 240000 || quota < 1) break;
      if(PropertiesService.getScriptProperties().getProperty('SEND_ENABLED') !== 'true') break;
      if(MailApp.getRemainingDailyQuota() < 1) break;
      var job = jobs[i];
      // This irreversible reservation happens before MailApp. Never retry it after
      // an uncertain response: there is no Gmail idempotency key to deduplicate.
      var payload = workerRequest_(config, 'reserve', { id: job.id, lease: job.lease }).payload;
      if(!payload) continue; // canceled, changed, disabled, already attempted or lease expired
      var accepted = false;
      try {
        if(payload.from !== config.sender || !Array.isArray(payload.to) || payload.to.length !== 1 ||
          !/^[^\s,;<>@]+@[^\s,;<>@]+$/.test(payload.to[0]) || typeof payload.subject !== 'string' || typeof payload.text !== 'string') {
          throw new Error('Invalid canonical delivery payload.');
        }
        MailApp.sendEmail({ to: payload.to[0], subject: payload.subject, body: payload.text, name: 'DECIDE.' });
        accepted = true; sent++;
      } catch(ignore) {
        // MailApp errors can have an unknown delivery outcome. Do not resend.
        uncertain++;
      }
      quota--;
      var completed = false;
      // Completion is idempotent and may be retried; the email send is never retried.
      for(var attempt = 0; attempt < 2 && !completed; attempt++) {
        try { completed = workerRequest_(config, 'complete', { id: job.id, lease: job.lease, accepted: accepted }).ok === true; }
        catch(ignore) {}
      }
      if(!completed) uncertain++;
    }
    console.log(JSON.stringify({ sent: sent, requiresReview: uncertain }));
    if(uncertain > 0) throw new Error('Some reminder outcomes require review. They will not be resent automatically.');
  } finally { lock.releaseLock(); }
}

// Setup test: only sends to the dedicated sending account itself.
function sendTestEmail() {
  var config = workerConfig_();
  if(workerRequest_(config, 'status').ok !== true) throw new Error('Mail worker is not connected.');
  if(MailApp.getRemainingDailyQuota() < 1) throw new Error('Daily recipient quota exhausted.');
  MailApp.sendEmail({
    to: config.sender,
    subject: 'DECIDE.｜リマインドメールの接続テスト',
    body: 'DECIDEのメール送信テストです。\n\nこのメールが届いていれば、専用GmailとGoogle Apps Scriptからの送信ができています。\n\nhttps://decisionprocess.net',
    name: 'DECIDE.'
  });
  console.log('Setup test accepted for the dedicated account itself.');
}
