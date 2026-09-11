# Kiến Trúc & Lưu Đồ Tuần Tự: Import Excel Quy Mô Lớn (Zero-Disk Streaming & Async HANA Bulk Merge)

Tài liệu này mô tả chi tiết kiến trúc và quy trình xử lý upload file Excel/CSV quy mô lớn (**lên đến 500.000+ dòng**) bằng kỹ thuật **Zero-Disk In-Memory Streaming**, **Xử lý Bất đồng bộ (Async Background Polling)** và **SAP HANA Native Bulk Merge**. Kiến trúc này giải quyết triệt để các vấn đề:
1. **HTTP 504 Gateway Timeout** trên SAP BTP / Cloud Foundry Router.
2. **Lỗi `ENOSPC` (hết dung lượng ổ cứng `/tmp`)** khi giải nén file Excel dung lượng lớn.
3. **Lỗi `Out Of Memory` (OOM)** trên container Node.js bằng cách giới hạn mức chiếm dụng RAM < 50MB.
4. **Tối ưu tốc độ DB** với cơ chế hai giai đoạn: Bảng tạm Staging $\rightarrow$ In-Memory `MERGE INTO` của SAP HANA.

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
    participant Staging as Bảng tạm (StagingMaintenanceOrders)
    participant DB as SAP HANA (MaintenanceOrders)

    Note over User,DB: GIAI ĐOẠN 1: TẢI TỆP LÊN & KHỞI TẠO TIẾN TRÌNH (HANDSHAKE)
    User->>Ctrl: Chọn file .xlsx (lên đến 500K dòng) & bấm "Upload & Process"
    Ctrl->>Srv: importOrdersExcel(oFile, fnOnProgress)
    Note over Srv: Đóng gói file vào FormData (Binary Stream)
    Srv->>BE: POST /api/maintenance/import-excel-async (FormData)
    Note over BE: Multer nạp file vào RAM Buffer<br/>Tạo jobId duy nhất (job-timestamp-uuid)
    BE->>Worker: Kích hoạt worker chạy ngầm (processExcelImport)
    BE-->>Srv: Phản hồi 200 OK: { jobId: "job-xyz", status: "PENDING", progress: 5 }
    Srv-->>Ctrl: fnOnProgress(5%, "Loading master data...")
    Ctrl->>User: Cập nhật ProgressBar (5%) & Bật trạng thái Import

    Note over User,DB: GIAI ĐOẠN 2: ZERO-DISK STREAMING & XÁC THỰC BATCH
    Worker->>DB: Pre-fetch Master Data (Equipments, Plants, Catalog...)
    DB-->>Worker: Trả về danh mục -> Nạp vào Set & Map trong RAM (O(1) lookup)
    Note over Worker: unzipper.Open.buffer(buffer)<br/>Stream XML trực tiếp từ RAM (0 byte disk)
    
    loop Mỗi 10.000 dòng & Polling mỗi 1.5s
        Srv->>BE: GET /api/maintenance/import-job/job-xyz
        Worker->>Worker: Validate dòng (Equipment, Plant, Dates, Operations, Materials)
        alt Đạt mốc BATCH_SIZE = 5000 dòng
            Worker->>Staging: Batch INSERT vào StagingMaintenanceOrders
            Worker->>DB: Batch UPSERT Operations & Materials
        end
        Worker-->>BE: Cập nhật Job: { progress: 20%... 75%, message: "Validating row X/500000..." }
        BE-->>Srv: Trả về { status: "RUNNING", progress: 65, message: "Validating..." }
        Srv-->>Ctrl: fnOnProgress(65%, "Validating...")
        Ctrl->>User: Nhảy tiến trình mượt mà trên UI ProgressIndicator
    end

    Note over User,DB: GIAI ĐOẠN 3: NATIVE HANA MERGE & HOÀN TẤT
    Worker->>Staging: Flush nốt các dòng còn lại vào Staging
    Worker->>DB: Thực thi SQL "MERGE INTO MaintenanceOrders USING Staging..."
    Note over DB: Engine HANA in-memory xử lý 500.000 dòng (~1-2s)<br/>Tự động phân loại: Khi MATCHED -> UPDATE, Khi NOT MATCHED -> INSERT
    Worker->>Staging: TRUNCATE TABLE StagingMaintenanceOrders (Dọn sạch bảng tạm)
    Worker->>DB: Ghi AuditHistory & OrderHistory
    
    alt Có dòng dữ liệu bị lỗi (Validation Fail)
        Worker->>Worker: Tạo file Excel báo lỗi (Tô đỏ các ô sai + lý do)
    end
    Worker-->>BE: Cập nhật Job: status = "COMPLETED", result = { importedCount, failedCount, errorFileBase64 }
    
    Srv->>BE: GET /api/maintenance/import-job/job-xyz (Lần poll cuối)
    BE-->>Srv: Trả về { status: "COMPLETED", result: { ... } }
    Note over Srv: clearInterval(pollInterval)<br/>Promise resolve(result)
    Srv-->>Ctrl: return result
    Ctrl->>Ctrl: Đóng Dialog Import, reload danh sách & KPIs
    
    alt Có lỗi (failedCount > 0)
        Ctrl->>User: Hiển thị MessageBox: Báo số dòng thành công + Nút "Download Error Rows (.xlsx)"
        User->>Ctrl: Bấm tải file lỗi
        Ctrl->>User: Trình duyệt tải file MaintenanceOrders_Errors_YYYY-MM-DD.xlsx
    else Thành công 100%
        Ctrl->>User: Hiển thị MessageBox: Import thành công trọn vẹn
    end
```

---

## 2. Lưu Đồ Trạng Thái Tiến Trình Nền (Job State Machine)

```mermaid
stateDiagram-v2
    [*] --> PENDING: Nhận file qua POST /import-excel-async
    PENDING --> LOADING_MASTER: Worker kết nối DB & nạp Master Data vào Set/Map RAM
    
    state RUNNING {
        LOADING_MASTER --> STREAMING_ROWS: Kích hoạt unzipper stream XML từ RAM
        STREAMING_ROWS --> VALIDATION: Kiểm tra tính hợp lệ từng dòng O(1)
        VALIDATION --> STAGING_BATCH: Gom đủ 5000 dòng -> Bulk Insert Staging
        VALIDATION --> ERROR_COLLECTION: Dòng lỗi -> Lưu vào mảng errors & highlight cell
        STAGING_BATCH --> HANA_BULK_MERGE: Xả hết stream -> Chạy Native SQL MERGE
        HANA_BULK_MERGE --> CLEANUP: TRUNCATE bảng tạm Staging
    }

    RUNNING --> COMPLETED: Xử lý thành công (Hoàn toàn hoặc Một phần)
    RUNNING --> FAILED: File hỏng, lỗi cú pháp nghiêm trọng hoặc crash hệ thống

    COMPLETED --> [*]: Trả kết quả thống kê & file lỗi Base64
    FAILED --> [*]: Báo lỗi chi tiết để Client hiển thị
```

---

## 3. Tại Sao Phải Dùng Bảng Tạm (Staging Table) & HANA Bulk Merge?

| Vấn Đề | Nếu Chèn Trực Tiếp Vào Bảng Chính | Kiến Trúc Dùng Bảng Tạm + HANA MERGE |
|:---|:---|:---|
| **Hiệu năng xử lý 500.000 dòng** | Mất **15 – 30 phút**, dễ bị Router Gateway Timeout (504). | **Chỉ mất ~ 2 – 3 phút** nhờ cơ chế Bulk Insert thô vào bảng tạm và Native In-Memory Merge. |
| **Xử lý Thêm mới vs Cập nhật (Upsert)** | Node.js phải `SELECT` từng dòng để kiểm tra trước $\rightarrow$ nghẽn I/O. | Câu lệnh `MERGE INTO` trên SAP HANA tự động so khớp khóa và phân nhánh `UPDATE` / `INSERT` song song ở mức phần cứng. |
| **An toàn giao dịch (Atomic)** | Nếu rớt mạng ở dòng 200.000, dữ liệu rác dở dang bị kẹt lại bảng chính. | Bảng chính chỉ nhận dữ liệu khi toàn bộ file đã được kiểm tra hợp lệ 100%. |
| **Tránh khoá bảng (Locking)** | Khóa bảng `MaintenanceOrders` liên tục trong nhiều phút $\rightarrow$ làm đơ/treo ứng dụng Fiori của các kỹ sư khác. | Thao tác import diễn ra trên bảng tạm riêng biệt; thao tác trên bảng chính chỉ diễn ra trong **1-2 giây**. |

---

## 4. Bảng Chi Tiết Các Bước Giao Tiếp API

| Bước | Giao Thức & Endpoint | Payload Gửi Đi | Dữ Liệu Trả Về | Ý Nghĩa Kỹ Thuật |
|:---|:---|:---|:---|:---|
| **1** | `POST /api/maintenance/import-excel-async` | `multipart/form-data` chứa file binary | `{ "jobId": "job-172589...", "status": "PENDING", "progress": 5 }` | Gửi file nhanh chóng. Server trả về Job ID ngay lập tức (**< 2s**) để tránh HTTP 504 Gateway Timeout. |
| **2** | `GET /api/maintenance/import-job/:jobId` *(Định kỳ 1.5s)* | *None* | `{ "jobId": "...", "status": "RUNNING", "progress": 45, "message": "Validating row 225000/500000..." }` | Polling thăm dò tiến độ. Tải dữ liệu rất nhẹ (< 200 bytes), cập nhật Progress Bar liên tục. |
| **3** | `GET /api/maintenance/import-job/:jobId` *(Lần cuối)* | *None* | `{ "status": "COMPLETED", "result": { "importedCount": 499950, "failedCount": 50, "errorFileBase64": "..." } }` | Worker xử lý xong. Dừng chu kỳ poll (`clearInterval`), hiển thị tóm tắt và kích hoạt tải file lỗi nếu có. |
| **4 (Dự phòng)** | `GET /api/maintenance/download-errors/:jobId` | *None* | File binary `.xlsx` | Endpoint tải trực tiếp file dòng lỗi từ Server trong trường hợp không giải mã được Base64 trên Client. |

---

## 5. Các File Mã Nguồn Tham Chiếu
- **UI Controller**: [MaintenanceOrders.controller.js](file:///d:/ĐỒ%20ÁN%20ĐI%20LÀM/FPT/maintenance-cockpit2/app/webapp/controller/MaintenanceOrders.controller.js)
- **Frontend Service Layer**: [CAPService.js](file:///d:/ĐỒ%20ÁN%20ĐI%20LÀM/FPT/maintenance-cockpit2/app/webapp/model/CAPService.js)
- **Backend Server Router**: [srv/server.js](file:///d:/ĐỒ%20ÁN%20ĐI%20LÀM/FPT/maintenance-cockpit2/srv/server.js)
- **Import Engine & Zero-Disk Streaming**: [srv/excel-import-service.js](file:///d:/ĐỒ%20ÁN%20ĐI%20LÀM/FPT/maintenance-cockpit2/srv/excel-import-service.js)
- **Database Schema & Staging Table**: [db/schema.cds](file:///d:/ĐỒ%20ÁN%20ĐI%20LÀM/FPT/maintenance-cockpit2/db/schema.cds)
