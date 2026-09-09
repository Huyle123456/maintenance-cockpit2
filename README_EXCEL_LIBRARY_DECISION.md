# Excel Library Decision

Tài liệu này giải thích vì sao project dùng `xlsx` (SheetJS) và `exceljs` cho luồng Excel, thay vì parser SAX/streaming hoặc các thư viện Node.js khác.

## Quyết định hiện tại

| Nhu cầu                     | Thư viện                | Cách dùng trong project                                                                                                    |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Đọc/import workbook         | `xlsx` 0.18.5 (SheetJS) | [srv/excel-import-service.js](srv/excel-import-service.js) dùng `XLSX.read(buffer)` và `XLSX.utils.sheet_to_json()`.       |
| Tạo/download template Excel | `exceljs` 4.4.0         | [server.js](server.js) và [srv/server.js](srv/server.js) dùng `new ExcelJS.Workbook()` và `workbook.xlsx.write(response)`. |
| Upload HTTP multipart       | `multer`                | Nhận file dưới dạng `req.file.buffer`.                                                                                     |

## Vì sao dùng SheetJS (`xlsx`) để import

Import hiện cần đọc nhiều sheet có quan hệ với nhau:

- `MaintenanceOrders`
- `Operations`
- `Materials`

Service phải tìm sheet theo tên, map headers linh hoạt, ghép operations/materials vào order theo order number hoặc equipment, deduplicate, sau đó tính cost. `xlsx` phù hợp vì:

1. API `sheet_to_json` đơn giản hóa workbook thành dữ liệu object để xử lý business rule.
2. Hỗ trợ `.xlsx`, `.xls` và nhiều biến thể dữ liệu Excel.
3. Đọc được toàn bộ workbook, nên có thể dùng dữ liệu từ sheet `Operations`/`Materials` trước khi xử lý từng order.
4. Code hiện có đã tối ưu phần ghi database bằng batch `500` records; parser không phải phần duy nhất quyết định hiệu năng.

Ví dụ luồng hiện tại:

```js
const workbook = XLSX.read(buffer, {
  type: "buffer",
  cellDates: true,
  dense: true,
});
const orderRows = XLSX.utils.sheet_to_json(workbook.Sheets[orderSheetName], {
  defval: "",
});
```

`dense: true` giúp SheetJS dùng representation tối ưu hơn cho worksheet có dữ liệu dày, phù hợp với file order lớn.

## Vì sao dùng ExcelJS để tạo template

Template cần nhiều sheet, header styling, width cột, fill color và stream trực tiếp ra HTTP response. `exceljs` phù hợp hơn cho phần này:

```js
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet("MaintenanceOrders");
worksheet.columns = [...];
await workbook.xlsx.write(response);
```

SheetJS Community Edition mạnh ở đọc/chuyển đổi dữ liệu; ExcelJS có API tiện hơn để tạo file `.xlsx` có format. Dùng hai thư viện ở hai vai trò khác nhau là có chủ đích.

## SAX/streaming parser là gì

`.xlsx` thực chất là file ZIP chứa XML. SAX (Simple API for XML) parser đọc XML theo từng event/token liên tiếp, thay vì dựng toàn bộ XML hoặc toàn bộ workbook trong memory.

```mermaid
flowchart LR
  A[XLSX ZIP] --> B[Worksheet XML]
  B --> C[SAX events từng row/cell]
  C --> D[Validate and buffer batch]
  D --> E[Insert database batch]
```

Ưu điểm chính của SAX/streaming là memory gần tỷ lệ với batch hiện tại, thay vì tỷ lệ với toàn bộ workbook.

## Vì sao chưa dùng SAX/streaming cho import hiện tại

| Tiêu chí               | SheetJS hiện tại                                   | SAX/streaming parser                                                                                           |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Đơn giản code          | Cao                                                | Thấp; phải tự xử lý shared strings, styles, date conversion và row/cell events.                                |
| Multi-sheet join       | Dễ giữ `Map` của Operations/Materials trong memory | Phải quy định thứ tự sheet hoặc lưu staging data; nếu Orders xuất hiện trước sheet phụ thì cần buffer/staging. |
| Header alias linh hoạt | Dễ qua object row                                  | Phải tự map index cột sang header.                                                                             |
| File cỡ vừa            | Phù hợp                                            | Over-engineering.                                                                                              |
| File rất lớn           | Memory tăng theo workbook                          | Phù hợp hơn.                                                                                                   |
| Progress realtime      | Có hook nhưng không stream thực sự                 | Có thể báo progress theo row tự nhiên.                                                                         |

Với giới hạn upload hiện tại là 100 MB và yêu cầu 50.000 rows, SheetJS là lựa chọn hợp lý để giảm độ phức tạp. Tuy nhiên file được giữ hoàn toàn ở `multer.memoryStorage()` và được parse toàn bộ bằng `XLSX.read`, nên đây không phải luồng streaming end-to-end.

## Các lựa chọn khác và lý do không chọn

| Lựa chọn                                      | Không chọn làm parser chính vì                                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExcelJS.stream.xlsx.WorkbookReader`          | Có streaming reader, nhưng code sẽ phức tạp hơn SheetJS khi cần chuẩn hóa header linh hoạt và join dữ liệu từ nhiều sheet. Đây là phương án nâng cấp khả thi nếu memory là bottleneck. |
| SAX XML trực tiếp như `sax` hoặc `node-expat` | Quá low-level cho use case nghiệp vụ; phải tự giải ZIP, parse shared strings và chuyển Excel serial date.                                                                              |
| `xlsx-stream-reader`                          | Có API streaming nhưng hệ sinh thái và khả năng xử lý workbook/phức tạp format kém trực tiếp hơn SheetJS/ExcelJS.                                                                      |
| CSV parser như `fast-csv` hoặc `csv-parse`    | CSV không giữ được nhiều sheet, formatting và cấu trúc workbook template. Có thể dùng nếu product chấp nhận import CSV đơn sheet.                                                      |
| Chỉ dùng ExcelJS                              | Có thể làm được, nhưng phải thay parser hiện tại và test lại toàn bộ logic Excel aliases/dates/multi-sheet. Hiện ExcelJS đã phục vụ tốt use case tạo template.                         |

## Khi nào nên chuyển sang streaming/SAX

Chuyển parser import sang `ExcelJS.stream.xlsx.WorkbookReader` hoặc SAX-based parser khi có ít nhất một điều kiện:

- File thực tế thường lớn hơn khoảng 100 MB.
- Số rows tăng lên hàng trăm nghìn hoặc hàng triệu.
- Memory của Cloud Foundry instance bị áp lực/OOM.
- Cần hiển thị progress theo row ngay trong lúc parse.
- Cần xử lý lâu và đã chuyển kiến trúc HTTP synchronous thành import job bất đồng bộ.

Khi chuyển, cần thiết kế đồng thời:

1. Upload file sang object storage/staging thay vì `multer.memoryStorage()`.
2. Import job có `jobId`, status và progress endpoint.
3. Staging strategy cho multi-sheet data hoặc quy định sheet `Operations`/`Materials` phải được parse trước `MaintenanceOrders`.
4. Database batch insert/update và error report theo row.

## Lưu ý kỹ thuật hiện tại

`excel-import-service.js` có dòng `const ExcelJS = require("exceljs")` nhưng không dùng `ExcelJS` trong file đó. Parser thực tế là SheetJS (`xlsx`). Có thể xóa import này trong một cleanup riêng để tránh hiểu nhầm và giảm dependency loading; không nên xóa package `exceljs` vì nó vẫn được dùng để tạo template trong `server.js` và `srv/server.js`.
