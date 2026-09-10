# Kiến Trúc & Lưu Đồ Tuần Tự: Import Excel Bất Đồng Bộ (Async Import & Polling)

Tài liệu này mô tả chi tiết quy trình xử lý upload file Excel dung lượng lớn (hàng chục nghìn dòng) bằng kỹ thuật **Asynchronous Background Processing kết hợp Client Polling** nhằm ngăn chặn triệt để lỗi **HTTP 504 Gateway Timeout** trên môi trường SAP BTP / Cloud Foundry.

---

## 1. Biểu Đồ Tuần Tự (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng (UI Fiori)
    participant Ctrl as MaintenanceOrders.controller
    participant Srv as CAPService (Frontend)
    participant BE as Server Express (srv/server.js)
    participant Worker as Background Worker (excel-import-service)
    participant DB as Database (SAP HANA / SQLite)

    Note over User,DB: GIAI ĐOẠN 1: TẢI TỆP LÊN & KHỞI TẠO TIẾN TRÌNH (HANDSHAKE)
    User->>Ctrl: Chọn file .xlsx & bấm "Upload & Process"
    Ctrl->>Srv: importOrdersExcel(oFile, fnOnProgress)
    Note over Srv: Đóng gói file vào FormData<br/>(Binary Stream, không tốn RAM)
    Srv->>BE: POST /api/maintenance/import-excel-async (FormData)
    Note over BE: Multer nạp file vào Buffer<br/>Tạo jobId duy nhất (job-timestamp-uuid)
    BE->>Worker: Kích hoạt worker chạy ngầm (async function)
    BE-->>Srv: Phản hồi 200 OK: { jobId: "job-xyz", status: "PENDING", progress: 5 }
    Srv-->>Ctrl: fnOnProgress(5%, "File uploaded. Starting processing in background...")
    Ctrl->>User: Cập nhật ProgressBar (5%) & Thông báo đang nạp dữ liệu

    Note over User,DB: GIAI ĐOẠN 2: THĂM DÒ TIẾN ĐỘ ĐỊNH KỲ (POLLING LOOP)
    loop Mỗi 1.5 giây (setInterval)
        Srv->>BE: GET /api/maintenance/import-job/job-xyz
        Worker->>DB: Đọc cache danh mục: Equipments, Plants, Catalog...
        Worker->>Worker: Parse SheetJS & Validate từng dòng dữ liệu
        Worker-->>BE: Cập nhật trạng thái Job: { progress: 35%... 70%, message: "Validating line..." }
        BE-->>Srv: Trả về { status: "RUNNING", progress: 70, message: "Validating..." }
        Srv-->>Ctrl: fnOnProgress(70%, "Validating...")
        Ctrl->>User: Nhảy tiến trình mượt mà trên UI ProgressIndicator
    end

    Note over User,DB: GIAI ĐOẠN 3: HOÀN TẤT & XỬ LÝ KẾT QUẢ (COMPLETED)
    Worker->>DB: Batch INSERT orders hợp lệ (chunk 500 rows)
    alt Có dòng dữ liệu bị lỗi
        Worker->>Worker: Tạo file Excel highlight cột lỗi đỏ (Base64)
    end
    Worker-->>BE: Cập nhật Job: status = "COMPLETED", result = { importedCount, failedCount, errorFileBase64 }
    
    Srv->>BE: GET /api/maintenance/import-job/job-xyz (Lần poll cuối)
    BE-->>Srv: Trả về { status: "COMPLETED", result: { ... } }
    Note over Srv: clearInterval(pollInterval)<br/>Promise resolve(result)
    Srv-->>Ctrl: return result
    Ctrl->>Ctrl: Đóng Dialog Import, reload danh sách & KPIs
    
    alt Có lỗi (failedCount > 0)
        Ctrl->>User: Hiển thị MessageBox Cảnh báo: Tóm tắt đơn tạo mới & Nút "Download Error Rows (.xlsx)"
        User->>Ctrl: Bấm tải file lỗi
        Ctrl->>User: Trình duyệt tải ngay file MaintenanceOrders_Errors.xlsx
    else Thành công 100%
        Ctrl->>User: Hiển thị MessageBox Thành công trọn vẹn
    end
```

---

## 2. Lưu Đồ Trạng Thái Tiến Trình Nền (Job State Machine)

```mermaid
stateDiagram-v2
    [*] --> PENDING: Nhận file qua POST /import-excel-async
    PENDING --> RUNNING: Worker đọc file & pre-fetch Master Data
    
    state RUNNING {
        [*] --> ValidateRows: Kiểm tra cú pháp, ngày tháng, mã thiết bị
        ValidateRows --> BatchInsertDB: Lưu các dòng hợp lệ vào DB
        ValidateRows --> GenerateErrorExcel: Gom các dòng lỗi & tô màu cột lý do
        BatchInsertDB --> Finalizing
        GenerateErrorExcel --> Finalizing
    }

    RUNNING --> COMPLETED: Xử lý thành công (Hoàn toàn hoặc Một phần)
    RUNNING --> FAILED: File hỏng, lỗi cú pháp nghiêm trọng hoặc crash hệ thống

    COMPLETED --> [*]: Trả kết quả thống kê & file lỗi Base64
    FAILED --> [*]: Báo lỗi chi tiết để Client hiển thị
```

---

## 3. Bảng Chi Tiết Các Bước Giao Tiếp API

| Bước | Giao Thức & Endpoint | Payload Gửi Đi | Dữ Liệu Trả Về | Ý Nghĩa Kỹ Thuật |
|:---|:---|:---|:---|:---|
| **1** | `POST /api/maintenance/import-excel-async` | `multipart/form-data` chứa file binary | `{ "jobId": "job-172589...", "status": "PENDING", "progress": 5 }` | Gửi file nhanh chóng. Server trả về Job ID ngay lập tức (**< 2s**) để tránh HTTP 504 Gateway Timeout. |
| **2** | `GET /api/maintenance/import-job/:jobId` *(Định kỳ 1.5s)* | *None* | `{ "jobId": "...", "status": "RUNNING", "progress": 45, "message": "Validating row 2250/5000..." }` | Polling thăm dò tiến độ. Tải dữ liệu rất nhẹ (< 200 bytes), truyền tiến trình liên tục lên UI. |
| **3** | `GET /api/maintenance/import-job/:jobId` *(Lần cuối)* | *None* | `{ "status": "COMPLETED", "result": { "importedCount": 4980, "failedCount": 20, "errorFileBase64": "..." } }` | Worker xử lý xong. Dừng chu kỳ poll (`clearInterval`), bóc tách dữ liệu để hiển thị kết quả. |
| **4 (Dự phòng)** | `GET /api/maintenance/download-errors/:jobId` | *None* | File binary `.xlsx` | Endpoint tải trực tiếp file dòng lỗi từ Server trong trường hợp không giải mã được Base64 trên Client. |

---

## 4. Các File Mã Nguồn Tham Chiếu
- **UI Controller**: [MaintenanceOrders.controller.js](file:///d:/%C4%90%E1%BB%92%20%C3%81N%20%C4%90I%20L%C3%80M/FPT/maintenance-cockpit2/app/webapp/controller/MaintenanceOrders.controller.js#L1091-L1226)
- **Frontend Service Layer**: [CAPService.js](file:///d:/%C4%90%E1%BB%92%20%C3%81N%20%C4%90I%20L%C3%80M/FPT/maintenance-cockpit2/app/webapp/model/CAPService.js#L391-L470)
- **Backend Server Router**: [srv/server.js](file:///d:/%C4%90%E1%BB%92%20%C3%81N%20%C4%90I%20L%C3%80M/FPT/maintenance-cockpit2/srv/server.js#L350-L450)
- **Import Engine & Validation**: [srv/excel-import-service.js](file:///d:/%C4%90%E1%BB%92%20%C3%81N%20%C4%90I%20L%C3%80M/FPT/maintenance-cockpit2/srv/excel-import-service.js#L345-L950)
