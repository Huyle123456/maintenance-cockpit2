/**
 * Backend Localization (i18n) Module for CAP & Express Services.
 * Supports Vietnamese (vi) and English (en).
 */

const translations = {
  vi: {
    // Validation: Date
    importExcelDateInvalidObject: "Định dạng ngày không hợp lệ (Invalid Date object)",
    importExcelDateSerialInvalid: "Số serial ngày '{0}' không hợp lệ",
    importExcelDateNonExistent: "Ngày '{0}' không tồn tại trên lịch",
    importExcelDateInvalid: "Ngày bắt đầu '{0}' không đúng định dạng",
    importExcelDateEndInvalid: "Ngày kết thúc '{0}' không đúng định dạng",
    importExcelDateUnrecognized: "Không thể nhận diện ngày '{0}'",
    importExcelDateFromAfterTo: "Ngày bắt đầu ({0}) không được lớn hơn ngày kết thúc ({1})",

    // Validation: Rows
    importExcelEquipmentRequired: "Mã thiết bị (Equipment) không được để trống",
    importExcelEquipmentNotFound: "Mã thiết bị '{0}' không tồn tại trong danh mục Thiết bị",
    importExcelDescriptionRequired: "Mô tả công việc (Description) không được để trống",
    importExcelPlantNotFound: "Mã nhà xưởng/plant '{0}' không tồn tại trong danh mục",
    importExcelOpHoursInvalid: "Số giờ công việc '{0}' không hợp lệ (phải >= 0)",
    importExcelMatQtyInvalid: "Số lượng vật tư '{0}' không hợp lệ (phải > 0)",

    // Workbook
    importExcelNoSheets: "Tệp tải lên không chứa bảng tính (sheet) nào.",
    importExcelNoOrderRows: "Tệp Excel tải lên không có dòng dữ liệu lệnh bảo trì để xử lý.",

    // Progress
    importExcelProgressLoadingMasterData: "Đang tải bộ đệm dữ liệu danh mục...",
    importExcelProgressReadingWorkbook: "Đang đọc tệp Excel...",
    importExcelProgressValidatingRow: "Đang kiểm tra dòng dữ liệu {0} / {1}...",
    importExcelProgressSavingOrders: "Đang lưu {0} đơn bảo trì vào cơ sở dữ liệu...",
    importExcelProgressSavingOpsAndMats: "Đang lưu các công việc và vật tư...",
    importExcelProgressRecordingAudit: "Đang ghi nhận nhật ký hệ thống...",
    importExcelProgressCompleted: "Đã hoàn tất xử lý {0} dòng dữ liệu.",

    // Error Workbook
    importExcelErrorColHeader: "Lý do lỗi (Error Reason)",
    importExcelLineFallback: "Dòng {0}",

    // Descriptions & History
    importExcelDefaultOpDesc: "Bảo trì & Kiểm tra tiêu chuẩn",
    importExcelDefaultTask: "Công việc bảo trì",
    importExcelDefaultInspection: "Kiểm tra & Bảo trì",
    importExcelHistoryOrderUpdated: "Cập nhật lệnh qua tệp import",
    importExcelHistoryOrderCreated: "Tạo mới lệnh bảo trì",
    importExcelHistorySyncText: "Đơn bảo trì đồng bộ với {0} công việc.",
    importExcelAuditObject: "Import hàng loạt ({0} đơn)",
    importExcelAuditDetails: "Đã nhập {0} đơn bảo trì ({1} tạo mới, {2} cập nhật), {3} dòng lỗi trong {4}s.",

    // Server Job Status Messages
    importExcelJobReceived: "Đã nhận tệp. Đang khởi chạy tiến trình xử lý trong nền...",
    importExcelJobUploaded: "Tệp đã tải lên thành công. Đang xử lý trong nền.",
    importExcelJobPartialSuccess: "Import hoàn tất một phần: {0} đơn thành công, {1} dòng lỗi.",
    importExcelJobSuccess: "Import hoàn tất thành công 100%.",
    importExcelJobFailed: "Tiến trình import thất bại",

    // General API & Order Lifecycle Messages
    errTemplateGen: "Không thể tạo tệp mẫu Excel",
    errNoFileUploaded: "Chưa có tệp Excel nào được tải lên",
    errKpiQueryFailed: "Lỗi khi truy vấn chỉ số KPI",
    errOrderNoRequired: "Mã đơn hàng là bắt buộc",
    auditOrderCreated: "Đơn hàng bảo trì đã được tạo mới",
    auditOrderCancelled: "Lệnh bảo trì đã bị hủy bởi người dùng",
    auditOrderCompleted: "Lệnh bảo trì đã được đánh dấu hoàn thành",
    historyOrderCreatedTitle: "Tạo lệnh bảo trì",
    historyOrderCreatedText: "Đơn hàng được khởi tạo trong hệ thống",
    historyOrderCancelledTitle: "Trạng thái đổi thành CANCELLED",
    historyOrderCancelledText: "Lệnh bảo trì đã bị hủy",
    historyOrderCompletedTitle: "Trạng thái đổi thành COMPLETED",
    historyOrderCompletedText: "Công việc bảo trì đã hoàn tất",
  },
  en: {
    // Validation: Date
    importExcelDateInvalidObject: "Invalid Date object",
    importExcelDateSerialInvalid: "Date serial number '{0}' is invalid",
    importExcelDateNonExistent: "Date '{0}' does not exist on calendar",
    importExcelDateInvalid: "Start date '{0}' is invalid format",
    importExcelDateEndInvalid: "End date '{0}' is invalid format",
    importExcelDateUnrecognized: "Unrecognized date format '{0}'",
    importExcelDateFromAfterTo: "Start date ({0}) cannot be later than end date ({1})",

    // Validation: Rows
    importExcelEquipmentRequired: "Equipment ID is required",
    importExcelEquipmentNotFound: "Equipment '{0}' does not exist in Equipment master data",
    importExcelDescriptionRequired: "Order description is required",
    importExcelPlantNotFound: "Plant '{0}' does not exist in master data",
    importExcelOpHoursInvalid: "Operation planned hours in '{0}' is invalid (must be >= 0)",
    importExcelMatQtyInvalid: "Material quantity in '{0}' is invalid (must be > 0)",

    // Workbook
    importExcelNoSheets: "Uploaded workbook contains no sheets.",
    importExcelNoOrderRows: "The uploaded Excel file has no order rows to process.",

    // Progress
    importExcelProgressLoadingMasterData: "Loading master data cache...",
    importExcelProgressReadingWorkbook: "Reading Excel workbook...",
    importExcelProgressValidatingRow: "Validating order row {0} of {1}...",
    importExcelProgressSavingOrders: "Saving {0} orders to database...",
    importExcelProgressSavingOpsAndMats: "Saving operations and materials...",
    importExcelProgressRecordingAudit: "Recording audit history...",
    importExcelProgressCompleted: "Completed processing {0} rows.",

    // Error Workbook
    importExcelErrorColHeader: "Error Reason",
    importExcelLineFallback: "Line {0}",

    // Descriptions & History
    importExcelDefaultOpDesc: "Standard Maintenance & Inspection",
    importExcelDefaultTask: "Maintenance Operation",
    importExcelDefaultInspection: "Inspection & Maintenance",
    importExcelHistoryOrderUpdated: "Order updated via import",
    importExcelHistoryOrderCreated: "Order created",
    importExcelHistorySyncText: "Maintenance order synced with {0} op(s).",
    importExcelAuditObject: "Bulk Import ({0} orders)",
    importExcelAuditDetails: "Imported {0} orders ({1} created, {2} updated), {3} failed rows in {4}s.",

    // Server Job Status Messages
    importExcelJobReceived: "File received. Starting background worker...",
    importExcelJobUploaded: "File uploaded successfully. Processing in background.",
    importExcelJobPartialSuccess: "Partial import completed: {0} orders successful, {1} failed rows.",
    importExcelJobSuccess: "Import completed successfully.",
    importExcelJobFailed: "Import job failed",

    // General API & Order Lifecycle Messages
    errTemplateGen: "Failed to generate Excel template",
    errNoFileUploaded: "No Excel file uploaded",
    errKpiQueryFailed: "Failed to query KPI metrics",
    errOrderNoRequired: "Order number is required",
    auditOrderCreated: "Maintenance order created",
    auditOrderCancelled: "Order cancelled by user",
    auditOrderCompleted: "Order marked as completed",
    historyOrderCreatedTitle: "Order created",
    historyOrderCreatedText: "Order initialized in system",
    historyOrderCancelledTitle: "Status changed to CANCELLED",
    historyOrderCancelledText: "Order cancelled",
    historyOrderCompletedTitle: "Status changed to COMPLETED",
    historyOrderCompletedText: "Maintenance work finished",
  }
};

/**
 * Formats a localized string by replacing {0}, {1}, etc. with arguments.
 *
 * @param {string} key
 * @param {Array|*} [args]
 * @param {string} [locale="vi"]
 * @returns {string}
 */
function getText(key, args = [], locale = "vi") {
  const normLocale = (locale && String(locale).toLowerCase().startsWith("en")) ? "en" : "vi";
  const dict = translations[normLocale] || translations.vi;
  let text = dict[key] || translations.en[key] || key;

  if (args !== undefined && args !== null) {
    const params = Array.isArray(args) ? args : [args];
    params.forEach((val, idx) => {
      text = text.replace(new RegExp(`\\{${idx}\\}`, "g"), String(val));
    });
  }
  return text;
}

module.exports = {
  getText,
  translations,
};
