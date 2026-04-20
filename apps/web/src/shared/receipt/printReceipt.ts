export function printReceipt(html: string): void {
  const win = window.open("", "_blank", "width=420,height=760");
  if (!win) return;

  win.document.open();
  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt</title>
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      body { margin: 0; padding: 0; }

      @media print {
        @page {
          size: 80mm auto;
          margin: 0;
        }

        body {
          margin: 0;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>${html}</body>
</html>`);
  win.document.close();

  const trigger = () => {
    win.focus();
    win.print();
    win.close();
  };

  win.onload = () => setTimeout(trigger, 180);
  setTimeout(trigger, 500);
}
