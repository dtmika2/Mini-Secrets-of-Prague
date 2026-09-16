/**
 * Bursa Kvíz - Google Apps Script backend.
 *
 * This is NOT part of the website. It lives inside the Google Sheet and is what
 * turns it into something the quiz can POST to and the scoreboard can GET from.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 *  1. Open the Sheet → Extensions → Apps Script.
 *  2. Delete whatever is in Code.gs and paste this file in. Save.
 *  3. Deploy → New deployment → gear icon → Web app.
 *       Description:      Bursa quiz scores
 *       Execute as:       Me
 *       Who has access:   Anyone            ← must be "Anyone", not "Anyone with
 *                                             a Google account", or the tablets
 *                                             get an HTML sign-in page instead
 *                                             of JSON.
 *  4. Click Deploy and approve the authorization prompt (it will warn the app is
 *     "unverified" - that is normal for your own script; choose Advanced → Go to…).
 *  5. Copy the Web app URL. It ends in /exec and looks like
 *       https://script.google.com/macros/s/AKfycb..../exec
 *     That URL - not the spreadsheet URL - goes into SHEET_URL in index.html,
 *     scoreboard.html and editor.html.
 *
 * No time-based or on-edit trigger is needed: a web app deployment calls doGet
 * and doPost directly. You do not need to run any function by hand either; the
 * header row is created automatically on the first write.
 *
 * ── AFTER ANY EDIT TO THIS FILE ────────────────────────────────────────────
 * Deploy → Manage deployments → pencil icon → Version: New version → Deploy.
 * Editing and saving alone does NOT update the live /exec URL.
 *
 * ── ADDING THE EMAIL COLUMN TO A SHEET THAT ALREADY HAS ROWS ───────────────
 * Do this BEFORE deploying this version, or every existing row is misread -
 * the old Score column would be returned as Email and Correct as Score:
 *   1. Right-click column C (Score) → Insert 1 column left.
 *   2. Type Email into C1 and bold it to match the other headers.
 * sheet_() only writes headers when the sheet is completely empty, so it will
 * not fix an existing header row by itself.
 *
 * Columns written: Timestamp | Name | Email | Score | Correct
 * (Same layout as the Prague quiz's sheet.)
 *
 * The email is written to the Sheet but deliberately NOT returned by doGet:
 * the projector scoreboard is public and has no business showing addresses.
 */

var HEADERS = ['Timestamp', 'Name', 'Email', 'Score', 'Correct'];
var MAX_ROWS_RETURNED = 100;

/** Receives one finished game from the quiz. */
function doPost(e) {
  // Several tablets can finish at the same moment; without a lock two appends
  // can land on the same row and one score is lost.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'no body' });
    }
    var data = JSON.parse(e.postData.contents);

    // A payload queued offline by an older build carries no email at all, and
    // those flush after this version deploys - hence the null-tolerant read.
    sheet_().appendRow([
      new Date(),
      String(data.name == null ? '' : data.name).slice(0, 64),
      String(data.email == null ? '' : data.email).slice(0, 120),
      Number(data.score) || 0,
      Number(data.correct) || 0
    ]);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Feeds the projector scoreboard and editor.html's restore button. */
function doGet() {
  var values = sheet_().getDataRange().getValues();
  values.shift(); // drop the header row

  var rows = values
    .filter(function (r) { return String(r[1]).trim() !== ''; })
    .map(function (r) {
      return {
        name:    String(r[1]),
        score:   Number(r[3]) || 0,
        correct: Number(r[4]) || 0
      };
    });

  rows.sort(function (a, b) { return b.score - a.score || b.correct - a.correct; });

  return json_(rows.slice(0, MAX_ROWS_RETURNED));
}

/** First sheet in the workbook, with headers created on first use. */
function sheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
