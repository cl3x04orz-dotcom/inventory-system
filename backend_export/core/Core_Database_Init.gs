/**
 * Core_Database_Init.gs
 * [Core] 資料庫初始化與維修 (由 setup 觸發)
 */

function setup() {
    initDb();
    return 'Database setup complete!';
}

function checkDbInit() {
    const sheets = ['Users', 'Products', 'Inventory', 'Purchases', 'Sales', 'SalesDetails', 'Expenditures'];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let initialized = true;
    sheets.forEach(s => { if (!ss.getSheetByName(s)) initialized = false; });
    if (!initialized) initDb();
    return { status: 'ok', initialized: true };
}

function initDb() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const defineSheet = (name, headers) => {
        let sheet = ss.getSheetByName(name);
        if (!sheet) {
            sheet = ss.insertSheet(name);
            sheet.appendRow(headers);
        } else if (sheet.getLastRow() === 0) {
            sheet.appendRow(headers);
        }
    };
    defineSheet('Users', ['UserID', 'Username', 'PasswordHash', 'Role', 'Status', 'CreatedAt', 'Permissions']);
    defineSheet('Products', ['ProductID', 'ProductName', 'Category', 'DefaultPrice', '(Reserve)', 'SafetyStock', 'SortWeight']);
    defineSheet('Inventory', ['BatchID', 'ProductID', 'Quantity', 'ExpiryDate', 'EntryDate', 'Type', 'Cost']);
    defineSheet('Purchases', ['PurchaseID', 'Date', 'Vendor', 'ProductID', 'Quantity', 'UnitPrice', 'ExpiryDate', 'Buyer', 'PaymentMethod', 'Status', 'Operator']);
    defineSheet('Sales', ['SaleID', 'Date', 'SalesRep', 'TotalCash', 'Reserve', 'FinalTotal', 'Customer', 'Operator', 'PaymentMethod', 'Status']);
    defineSheet('SalesDetails', ['SaleID', 'ProductID', 'Picked', 'Original', 'Return', 'Sold', 'UnitPrice', 'Subtotal']);
    defineSheet('Expenditures', ['SaleID', 'Stall', 'Cleaning', 'Electricity', 'Gas', 'Parking', 'Goods', 'Bags', 'Others', 'LinePay', 'ServiceFee', 'TotalDeductions', 'Customer', 'SalesRep', 'Timestamp', 'VehicleMaintenance', 'Salary', 'Reserve', 'Note']);
}
