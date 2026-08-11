# מדריך הטמעה — סנכרון קבוצות וואטסאפ ל-Peach דרך n8n

מדריך זה מיועד למי שמיישם את הפתרון בפועל ב-n8n (בין אם זה אותו אדם שקרא את השיחה ובין אם לא). הוא עומד בפני עצמו — אין צורך בהקשר נוסף מעבר למה שכתוב כאן.

## מה זה עושה

בדיוק את מה שהשירות ב-`src/` בריפו הזה עושה (גרסת Node.js), אבל בתוך n8n: כשמישהו נכנס לקבוצת וואטסאפ שמנוטרת (דרך GREEN-API), הוא מקבל תיוג בקבוצה המתאימה באיש קשר ב-Peach CRM — אם הוא כבר קיים כאיש קשר, מתווספת לו הקבוצה; אם לא, נוצר איש קשר חדש עם התיוג.

**שני התהליכים (Node.js וה-n8n) עושים בדיוק אותו דבר.** תבחרו לפי מה שנוח לכם לתחזק — אין צורך להריץ את שניהם.

## למה יש שני "ענפים" בתהליך

ל-GREEN-API **אין webhook שמודיע "מישהו הצטרף לקבוצה"**. הדרך היחידה לדעת מי בקבוצה היא:
1. **בזמן אמת (חלקי):** כשחבר קבוצה כותב הודעה, מגיע webhook מסוג `incomingMessageReceived` עם הטלפון שלו ולפעמים גם שם — אבל רק אם הוא בפועל כותב.
2. **פולינג (הכרחי בשביל השאר):** קריאה מחזורית ל-`getGroupData` שמחזירה את כל החברים הנוכחיים בקבוצה, והשוואה לרשימה שנשמרה בפעם הקודמת — זו הדרך היחידה לתפוס מישהו שהצטרף "בשקט" (למשל דרך קישור הזמנה) בלי לכתוב הודעה.

לכן ה-workflow הראשי מכיל שני ענפים בלתי תלויים: אחד שמתחיל מ-Webhook (מהיר, לוכד מי שכותב) ואחד שמתחיל מ-Schedule Trigger (רשת ביטחון, לוכד גם מי ששקט). שניהם קוראים לאותו תת-תהליך (sub-workflow) לביצוע ה-upsert ב-Peach.

## מבנה הקבצים

- `main-workflow.json` — ה-workflow הראשי: Webhook + Schedule Trigger, זיהוי חברים חדשים, קריאה לתת-תהליך.
- `peach-upsert-subworkflow.json` — תת-תהליך שמקבל `{rawPhone, groupLabel, firstName, lastName}` ומבצע את הלוגיקה מול Peach (חפש → צור/עדכן).

## שלב 1: ייבוא

1. ב-n8n: **Workflows → Import from File**, ייבאו קודם את `peach-upsert-subworkflow.json` (השם בממשק: "Peach - Upsert Contact In Group"). **שמרו אותו** (Save) כדי שיקבל ID.
2. ייבאו את `main-workflow.json` (השם בממשק: "WhatsApp Group Watcher (GREEN-API to Peach)").
3. בשני הצמתים מסוג **Execute Workflow** בתהליך הראשי ("Upsert Contact (webhook)" ו-"Upsert Contact (poll)") — פתחו כל אחד ובחרו מחדש את תת-התהליך מהרשימה הנפתחת (ה-JSON מכיל placeholder ל-ID שלא יעבוד אוטומטית אחרי ייבוא לאינסטנס אחר). שני הצמתים צריכים להצביע לאותו תת-תהליך.

> **אם הייבוא נכשל או שצומת מסוים מסומן באדום:** זה קורה בעיקר בגרסאות n8n ישנות/חדשות יותר שבהן סכמת הפרמטרים של Webhook / HTTP Request / IF השתנתה מעט. פתחו את הצומת הבעייתי — הפאנל עדיין ייפתח, ופשוט מלאו מחדש את השדות הבודדים שלו לפי טבלת "הפניה מלאה לצמתים" בסוף המדריך. זה עניין של דקה-שתיים לצומת, לא בנייה מחדש.

## שלב 2: מילוי הגדרות

יש **4 מקומות** בקוד שצריך לערוך (כולם צמתי Code, קלים לעריכה — פותחים את הצומת, עורכים משתנה בראש הקוד, שומרים):

| צומת | תהליך | מה לערוך |
|---|---|---|
| `Config (webhook branch)` | ראשי | רשימת `watchedGroups` — chatId ותווית לכל קבוצה שרוצים לנטר |
| `Config (poll branch)` | ראשי | **אותה** רשימת `watchedGroups` (חובה לעדכן בשני המקומות!) + `greenApi.idInstance`, `greenApi.tokenInstance`, `greenApi.baseUrl` |
| `Peach Config and derive` | תת-תהליך | `apiKey`, ואופציונלית `baseUrl`/`authScheme`/`groupSyncMode`/`phoneFormat` וכו' |

### איך מוצאים chatId של קבוצה

הדרך הכי אמינה: שלחו הודעה כלשהי בקבוצה, תפסו את ה-webhook הנכנס (אפשר זמנית להצביע את ה-webhook ל-[webhook.site](https://webhook.site) לבדיקה), וקראו את `senderData.chatId` — זה המזהה בפורמט `120363XXXXXXXXXX@g.us`.

### הגדרת ה-Webhook ב-GREEN-API

ב-console של GREEN-API להגדרת ה-instance, הגדירו Webhook URL שמצביע ל-URL הציבורי של ה-webhook ב-n8n (מוצג בצומת "GREEN-API Webhook" אחרי שהתהליך פעיל — Production URL, לא Test URL), וודאו ש-`incomingMessageReceived` מופעל בהגדרות ה-notifications.

## שלב 3: הפעלה

1. הפעילו (Activate) את **שני** ה-workflows (התת-תהליך צריך להיות פעיל כדי ש-Execute Workflow יוכל לקרוא לו, בהתאם לגרסת n8n — בחלק מהגרסאות מספיק ששניהם שמורים, לא בהכרח "Active"; אם Execute Workflow נכשל עם שגיאת "workflow not found/active", הפעילו את התת-תהליך).
2. ה-Schedule Trigger ירוץ אוטומטית לפי המרווח שהוגדר (ברירת מחדל: כל 10 דקות). לבדיקה מיידית בלי לחכות — לחצו "Execute Workflow" ידנית על התהליך הראשי, או "Test Workflow" תוך בחירת ה-node של ה-Schedule.

## בדיקה

1. **בדיקת פולינג:** הריצו את התהליך הראשי ידנית (Execute Workflow → יבחר את שני הענפים; אפשר גם ללחוץ "Execute step" רק על צומת ה-Schedule ואילך). ודאו שהצומת "GreenAPI Get Group Data" מחזיר `participants`, ושבפעם הראשונה כל החברים הקיימים "מתגלים" כחדשים (זו התנהגות צפויה — ריצה ראשונה = baseline sync, לא שגיאה).
2. **בדיקת webhook:** הוסיפו מספר בדיקה לקבוצה מנוטרת ובקשו ממנו לכתוב הודעה. תוך שניות אמור להופיע execution חדש ב-n8n, ואיש קשר חדש/מעודכן ב-Peach.
3. **בדיקת Peach:** פתחו את איש הקשר ב-Peach וודאו שהקבוצה מופיעה (בשדה `groups` המובנה של Peach, או בשדה המותאם אישית אם עברתם למצב `customProperty`).

## נקודות שדורשות אימות מול Peach לפני production

תיעוד ה-API הרשמי (`https://api.peach-in.com/v4`) מציין:

- **חיפוש:** `POST /getContact` עם `{"phoneNumber": "0587701234"}` (פורמט מקומי ישראלי, בלי `+`).
- **יצירה:** `POST /contacts` עם `firstName`/`lastName`/`email` המסומנים בכוכבית (ייתכן שחובה) ו-`phone`.
- **עדכון:** `PUT /updateContact/{contactId}` עם `groups` (הוספה) / `removeGroups` (הסרה) / `customProperties`.
- **Authorization:** לא מפורט הסכמה המדויקת ("include your API key in the Authorization header") — ברירת המחדל בקוד היא `Bearer <key>`.

מכיוון שוואטסאפ נותן בעיקר טלפון (ולפעמים שם, כמעט אף פעם לא אימייל), צומת "Peach Config and derive" ממלא ברירות מחדל ל-`firstName`/`lastName`/`email` (ראו הקוד בצומת). **מומלץ להריץ בדיקה אחת אמיתית מול Peach לפני הפעלה מלאה** ולוודא: שה-Authorization scheme נכון (401 = לנסות בלי "Bearer"), שהחיפוש בפועל מוצא אנשי קשר קיימים, ושה-`groups`/`customProperties` אכן נשמרים כמצופה.

## הפרשי תחזוקה בין הגרסה הזו לגרסת ה-Node.js

- **State (מי כבר ידוע בקבוצה):** בגרסת Node זה קובץ JSON (`data/groups-state.json`). כאן זה `$getWorkflowStaticData('global')` של n8n — מנגנון מובנה שנשמר אוטומטית בין הרצות של אותו workflow, בלי צורך במסד נתונים חיצוני. מספיק לנפחים סבירים; אם יש הרבה מאוד קבוצות/חברים ורוצים היסטוריה/דיווחים, שווה בעתיד להחליף לצומת Postgres/Airtable/Google Sheets במקום.
- **רשימת הקבוצות מנוטרות פעמיים** (בענף ה-webhook ובענף ה-poll) — כי הם שני שרשראות נפרדות שמתחילות מ-triggers שונים. שינוי ברשימת הקבוצות דורש עדכון בשני המקומות.
- אם קריאה ל-Peach נכשלת עבור חבר ספציפי בזמן פולינג, הוא **לא ינוסה שוב אוטומטית** בסבב הבא (אותה התנהגות כמו בגרסת ה-Node) — כי הרשימה הידועה מתעדכנת מיד אחרי המשיכה, לפני שהעיבוד לכל חבר מסתיים. יש לעקוב אחרי executions כושלים ב-n8n (Settings → Error Workflow, או פשוט מעקב ידני) ולטפל ידנית אם צריך.

## הפניה מלאה לצמתים (fallback לבנייה ידנית)

אם צריך לבנות צומת מסוים מחדש (ייבוא נכשל, או רוצים להבין/לשנות), הנה כל צומת עם הסוג וההגדרות המרכזיות שלו:

### תהליך ראשי

| # | שם | סוג | הגדרות מרכזיות |
|---|---|---|---|
| 1 | GREEN-API Webhook | Webhook | HTTP Method: POST, Path: `peach-wa-group-sync`, Respond: Immediately, Response Code: 200 |
| 2 | Config (webhook branch) | Code | Run Once for All Items — ראו קוד בקובץ |
| 3 | Is incomingMessageReceived? | IF | `{{$json.body.typeWebhook}}` equals `incomingMessageReceived` |
| 4 | Match group and dedup | Code | Run Once for All Items |
| 5 | Upsert Contact (webhook) | Execute Workflow | קורא לתת-תהליך, מעביר rawPhone/groupLabel/firstName/lastName |
| 6 | Mark as known | Code | Run Once for Each Item |
| 7 | Poll Schedule | Schedule Trigger | Interval: 10 minutes (לשנות לפי הצורך) |
| 8 | Config (poll branch) | Code | Run Once for All Items |
| 9 | GreenAPI Get Group Data | HTTP Request | POST `{{baseUrl}}/waInstance{{id}}/getGroupData/{{token}}`, Body JSON: `{"groupId": ...}` |
| 10 | Diff members | Code | Run Once for Each Item |
| 11 | Explode new members | Code | Run Once for All Items |
| 12 | GreenAPI Get Contact Info | HTTP Request | POST `{{baseUrl}}/waInstance{{id}}/getContactInfo/{{token}}`, Continue On Fail: כן |
| 13 | Merge name into item | Code | Run Once for Each Item |
| 14 | Upsert Contact (poll) | Execute Workflow | אותו תת-תהליך כמו #5 |

חיבורים: 1→2→3(true)→4→5→6. 3(false)→(סוף, לא מחובר). 7→8→9→10→11→12→13→14.

### תת-תהליך "Peach - Upsert Contact In Group"

| # | שם | סוג | הגדרות מרכזיות |
|---|---|---|---|
| 1 | When Called | Execute Workflow Trigger | שדות קלט: rawPhone, groupLabel, firstName, lastName |
| 2 | Peach Config and derive | Code | Run Once for Each Item — כולל את כל ה-config (apiKey וכו') |
| 3 | Get Contact | HTTP Request | POST `{{peachBaseUrl}}/getContact`, Body JSON `{"phoneNumber": {{lookupPhone}}}`, Header `Authorization`, Continue On Fail: כן |
| 4 | Decide action | Code | Run Once for Each Item |
| 5 | Action is create? | IF | `{{$json.action}}` equals `create` |
| 6 | Create Contact | HTTP Request | POST `{{peachBaseUrl}}/contacts`, Body JSON `{{$json.body}}` |
| 7 | Action is update? | IF | `{{$json.action}}` equals `update` (על ה-false output של #5) |
| 8 | Update Contact | HTTP Request | PUT `{{peachBaseUrl}}/updateContact/{{contactId}}`, Body JSON `{{$json.body}}` |
| 9 | Already in group | NoOp | (ה-false output של #7) |

חיבורים: 1→2→3→4→5. 5(true)→6. 5(false)→7. 7(true)→8. 7(false)→9.
