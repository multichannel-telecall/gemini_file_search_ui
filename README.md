# מנהל קבצים Gemini File Search

לוח בקרה לניהול קבצים במאגר Gemini File Search. אפליקציית ווב פשוטה (client-side only) המאפשרת העלאה, צפייה ומחיקה של מסמכים.

## תכונות

- 🔑 **הזנת מפתח API** - הזן את מפתח ה-API שלך מ-Google (נשמר מקומית בדפדפן)
- 📁 **ניהול מאגר** - הזן את שם המאגר שלך ב-Gemini File Search
- ⬆️ **העלאת קבצים** - העלה קבצים ישירות מהמחשב שלך למאגר
- 📄 **צפייה במסמכים** - צפה בכל המסמכים במאגר עם pagination
- 🗑️ **מחיקת מסמכים** - מחק מסמכים עם אישור בטיחות
- 🎯 **סינון סוגי קבצים** - בחר אילו סוגי קבצים מותרים להעלאה (ברירת מחדל: PDF ו-MD)

## איך להריץ

### אופן 1: שרת מלא (מומלץ) - Node + Python

העלאת קבצים מנוהלת ב-Python באמצעות Google GenAI SDK (upload + index במבצע אחד).

**1. התקן את תלויות Python:**
```bash
pip install -r requirements.txt
```

**2. הפעל את שירות ההעלאה (Python) בטרמינל אחד:**
```bash
python upload_service.py
# או: npm run upload-service
```

**3. הפעל את השרת (Node) בטרמינל שני:**
```bash
npm run dev
```

זה יפתח את האפליקציה ב-`http://localhost:3001`

**Proxy:** אם אתה מאחורי proxy, הגדר לפני הפעלה:
```bash
# Windows (PowerShell)
$env:HTTPS_PROXY="http://user:pass@proxy:port"
$env:SSL_CERT_FILE="C:\path\to\cert.pem"

# Linux/Mac
export HTTPS_PROXY="http://user:pass@proxy:port"
export SSL_CERT_FILE="/path/to/cert.pem"
```

### אופן 2: שרת HTTP פשוט עם npm בלבד

```bash
npm run dev
```

**שים לב:** ללא שירות Python, העלאת קבצים לא תעבוד. הפעל `python upload_service.py` בהתאם.

### אופן 3: שרת HTTP סטטי עם Python

אם יש לך Python מותקן (לצפייה בלבד - ללא העלאה):

```bash
# Python 3
python -m http.server 3000

# Python 2
python -m SimpleHTTPServer 3000
```

ואז פתח את הדפדפן ב-`http://localhost:3000`

### אופן 4: פתיחה ישירה

פשוט פתח את הקובץ `index.html` בדפדפן. **שים לב:** ייתכנו בעיות CORS כאשר פותחים ישירות מהמערכת קבצים.

## שימוש

1. **הגדר את הפרטים שלך:**
   - הזן את מפתח ה-API של Google
   - הזן את שם המאגר (בפורמט: `fileSearchStores/store-id`)
   - בחר אילו סוגי קבצים מותרים (ברירת מחדל: `.pdf, .md`)

2. **צפה במסמכים:**
   - לחץ על כפתור "רענן" כדי לטעון את המסמכים מהמאגר
   - השתמש בכפתורי "הקודם" ו"הבא" לניווט בין עמודים
   - לחץ על כפתור המחיקה כדי למחוק מסמך (יופיע אישור)

3. **העלה קבצים:**
   - לחץ על "בחר קבצים" כדי לבחור קבצים מהמחשב שלך
   - הקבצים יסוננו לפי הסוגים המותרים
   - לחץ על "העלה קבצים" כדי להתחיל את ההעלאה
   - צפה בסטטוס ההעלאה בזמן אמת

## API של Gemini File Search

האפליקציה משתמשת ב-API הבאים:

### רשימת מסמכים
```
GET https://generativelanguage.googleapis.com/v1beta/{store_name}/documents?key={api_key}&pageToken={token}
```

### העלאת מסמך (Python - Google GenAI SDK)
```python
# upload_service.py משתמש ב:
operation = client.file_search_stores.upload_to_file_search_store(
    file='path/to/file.pdf',
    file_search_store_name=store_name,
    config={'display_name': 'Document Name'}
)
# ממתין לעיבוד (embedding/indexing) ומחזיר את המסמך
```

### מחיקת מסמך
```
DELETE https://generativelanguage.googleapis.com/v1beta/{document_name}?key={api_key}&force=true
```

## טכנולוגיות

- HTML5
- CSS3 (עם Flexbox ואנימציות)
- Vanilla JavaScript (ללא תלות חיצוניות)
- Google Generative Language API

## אבטחה

- מפתח ה-API נשמר רק ב-LocalStorage של הדפדפן שלך
- אין שרת backend - הכל פועל בצד הלקוח
- התקשורת ישירה עם API של Google

## רישיון

MIT
