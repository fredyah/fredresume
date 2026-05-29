# DevOps / SRE 面試題 Q1–Q6 HTML 整理

## 檔案說明

- `index.html`：主頁面，只負責版型與載入資源。
- `content.js`：Q1～Q6 的文字內容，後續維護主要改這個檔案。
- `styles.css`：視覺樣式。
- `app.js`：搜尋、展開收合、複製、列印等互動功能。

## 使用方式

直接用瀏覽器開啟 `index.html` 即可。

## 維護方式

要修改問題或回答內容，請編輯 `content.js` 中的 `window.INTERVIEW_QA_CONTENT` 陣列。
每一題的結構如下：

```js
{
  id: "q1",
  title: "題目標題",
  subtitle: "副標題",
  tags: ["標籤"],
  question: ["題目描述"],
  answer: [
    {
      heading: "段落標題",
      body: ["段落文字"],
      code: { lang: "bash", text: "..." },
      quote: "加分句",
      table: { headers: [...], rows: [[...]] }
    }
  ]
}
```
