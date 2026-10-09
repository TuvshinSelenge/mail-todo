// Run once from the Apps Script editor. Safe to re-run: creates the Sheet,
// the secret key and the Gmail label only if missing, and replaces the trigger.

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    props.setProperty('SHEET_ID', SpreadsheetApp.create('zan todos').getId());
  }
  todosSheet_();
  processedSheet_();
  const ss = spreadsheet_();
  ss.getSheets().forEach((sh) => {
    const name = sh.getName();
    if (name !== 'Todos' && name !== 'Processed') ss.deleteSheet(sh);
  });

  if (!props.getProperty('SECRET_KEY')) {
    props.setProperty('SECRET_KEY', Utilities.getUuid().replace(/-/g, ''));
  }

  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'checkInbox') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkInbox').timeBased().everyMinutes(1).create();

  if (!GmailApp.getUserLabelByName(LABEL_NAME)) GmailApp.createLabel(LABEL_NAME);

  console.log('Sheet: ' + ss.getUrl());
  console.log('Secret key: ' + props.getProperty('SECRET_KEY'));
}
