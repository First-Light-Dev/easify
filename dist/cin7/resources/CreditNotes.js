"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../puppeteer/constants");
class CreditNotes {
    constructor(axios, cin7) {
        this.axios = axios;
        this.cin7 = cin7;
    }
    async get(id) {
        const response = await this.axios.get(`/CreditNotes/${id}`);
        return response.data;
    }
    async getByOrderRefs(refs) {
        const _refs = refs.map(ref => ref.replace(/#/g, "%23"));
        const response = await this.axios.get(`/CreditNotes?where=${_refs.map(ref => `SalesReference='${ref}'`).join(' OR ')}`);
        return response.data;
    }
    async getByIds(ids) {
        const response = await this.axios.get(`/CreditNotes?where=${ids.map(id => `Id=${id}`).join(' OR ')}`);
        return response.data;
    }
    async search(query) {
        const response = await this.axios.get(`/CreditNotes?where=${query}`);
        return response.data;
    }
    async create(creditNote) {
        console.log("Creating Credit Note", JSON.stringify(creditNote));
        const response = await this.axios.post(`/CreditNotes`, [creditNote]);
        const data = response.data;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }
    async createBatch(creditNotes) {
        const response = await this.axios.post(`/CreditNotes`, creditNotes);
        return response.data;
    }
    async update(creditNote) {
        console.log("Updating Credit Note", JSON.stringify(creditNote));
        const response = await this.axios.put(`/CreditNotes`, [creditNote]);
        const data = response.data;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }
    async updateBatch(creditNotes) {
        const response = await this.axios.put(`/CreditNotes`, creditNotes);
        return response.data;
    }
    async createStockReceipts(stockReceipts) {
        var _a, _b, _c, _d;
        let returnValues = [];
        let page = await this.cin7.getPuppeteerPage();
        console.log("Creating stock receipts");
        for (const stockReceipt of stockReceipts) {
            try {
                console.log("Creating stock receipt", stockReceipt.id);
                await page.waitForNavigation({ waitUntil: 'networkidle0' });
                await page.goto(constants_1.CREDIT_NOTES.getUrl(stockReceipt.id));
                // await page.waitForNavigation({ waitUntil: 'networkidle0' });
                page.on('dialog', async (dialog) => {
                    console.log(`Dialog message: ${dialog.message()}`);
                    await dialog.accept();
                });
                console.log("Navigated to credit note");
                const lineItemsTableData = await page.evaluate((selector) => {
                    const skuFields = document.querySelectorAll(selector);
                    return Array.from(skuFields).map((skuField, index) => {
                        var _a, _b;
                        return ({
                            sku: (_b = (_a = skuField.innerHTML) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "",
                            nthChild: index + 2,
                        });
                    }).filter(data => data.sku !== "" && !data.sku.includes("<i>Search...</i>"));
                }, constants_1.CREDIT_NOTES.selectors.skuFields);
                console.log("Line items table data", JSON.stringify(lineItemsTableData));
                await page.waitForSelector(constants_1.CREDIT_NOTES.selectors.branchOptionOpenDialogButton, { visible: true });
                await page.click(constants_1.CREDIT_NOTES.selectors.branchOptionOpenDialogButton);
                await new Promise(resolve => setTimeout(resolve, 3000));
                const branchElements = await page.$$(constants_1.CREDIT_NOTES.selectors.branchOptions);
                for (const element of branchElements) {
                    const onclickAttr = await element.evaluate(el => el.getAttribute('onclick'));
                    const branchName = stockReceipt.branchName;
                    if (onclickAttr === null || onclickAttr === void 0 ? void 0 : onclickAttr.split("'").includes(branchName)) {
                        await element.click();
                        break;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
                for (const lineItem of lineItemsTableData) {
                    await page.click(constants_1.CREDIT_NOTES.selectors.getQtyMovedField(lineItem.nthChild));
                    console.log("Clicked qty moved field", lineItem.nthChild);
                    await page.waitForSelector(constants_1.CREDIT_NOTES.selectors.actualQtyMovedField, { timeout: 5000 });
                    console.log("Waited for actual qty moved field");
                    await page.evaluate(selector => {
                        const input = document.querySelector(selector);
                        if (input)
                            input.value = '';
                    }, constants_1.CREDIT_NOTES.selectors.actualQtyMovedField);
                    await page.evaluate(selector => {
                        const input = document.querySelector(selector);
                        if (input)
                            input.value = '';
                    }, constants_1.CREDIT_NOTES.selectors.batchNumberField);
                    await page.type(constants_1.CREDIT_NOTES.selectors.actualQtyMovedField, `${-1 * Math.abs((_b = (_a = stockReceipt.lines.find(line => line.sku === lineItem.sku)) === null || _a === void 0 ? void 0 : _a.qty) !== null && _b !== void 0 ? _b : 0)}`);
                    await page.type(constants_1.CREDIT_NOTES.selectors.batchNumberField, (_d = (_c = stockReceipt.lines.find(line => line.sku === lineItem.sku)) === null || _c === void 0 ? void 0 : _c.batch) !== null && _d !== void 0 ? _d : "");
                    await page.click(constants_1.CREDIT_NOTES.selectors.saveIntakeButton);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                const currentDate = new Date();
                const formattedDate = currentDate.toLocaleDateString('en-GB').replace(/\//g, '-'); // Format: DD-MM-YYYY
                const formattedTime = currentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // Format: HH:MM AM/PM
                await page.type(constants_1.CREDIT_NOTES.selectors.completedDateField, formattedDate);
                await page.type(constants_1.CREDIT_NOTES.selectors.completedTimeField, formattedTime);
                try {
                    await page.waitForSelector(constants_1.CREDIT_NOTES.selectors.approveButton, { timeout: 4000 });
                    await Promise.all([
                        page.click(constants_1.CREDIT_NOTES.selectors.approveButton),
                        page.waitForNavigation()
                    ]);
                }
                catch (error) {
                    await Promise.all([
                        page.click(constants_1.CREDIT_NOTES.selectors.saveButton),
                        page.waitForNavigation()
                    ]);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (error) {
                console.error(`Error creating stock receipt for credit note ${stockReceipt}:`, error);
                returnValues.push({
                    success: false,
                    error: error instanceof Error ? error.message : `Error: ${error}`,
                });
                await this.cin7.closeBrowser();
                page = await this.cin7.getPuppeteerPage();
            }
        }
        returnValues.push({
            success: true,
            error: "",
        });
        await this.cin7.closeBrowser();
        return returnValues;
    }
    async voidCreditNotes(creditNoteIds) {
        let returnValues = [];
        let page = await this.cin7.getPuppeteerPage();
        for (const creditNoteId of creditNoteIds) {
            try {
                console.log("Voiding credit note", creditNoteId, constants_1.CREDIT_NOTES.getUrl(creditNoteId));
                await Promise.all([
                    page.goto(constants_1.CREDIT_NOTES.getUrl(creditNoteId)),
                    page.waitForNavigation({
                        waitUntil: 'networkidle0'
                    })
                ]);
                await page.waitForSelector(constants_1.CREDIT_NOTES.selectors.adminButton, { timeout: 5000 });
                page.on('dialog', async (dialog) => {
                    console.log(`Dialog message: ${dialog.message()}`);
                    await dialog.accept();
                });
                const [response] = await Promise.all([
                    page.waitForNavigation(),
                    page.click(constants_1.CREDIT_NOTES.selectors.adminButton)
                ]);
                if (!response) {
                    throw new Error("Failed to go to admin page");
                }
                await page.waitForSelector(constants_1.CREDIT_NOTES.selectors.voidButton, { timeout: 5000 });
                const [voidResponse] = await Promise.all([
                    page.waitForNavigation(),
                    page.click(constants_1.CREDIT_NOTES.selectors.voidButton)
                ]);
                if (!voidResponse) {
                    throw new Error("Failed to void credit note");
                }
                returnValues.push({
                    success: true,
                    error: "",
                });
            }
            catch (error) {
                console.error(`Error voiding credit note ${creditNoteId}:`, error);
                returnValues.push({
                    success: false,
                    error: error instanceof Error ? error.message : `Error: ${error}`,
                });
                await page.close();
                page = await this.cin7.getPuppeteerPage();
            }
        }
        await this.cin7.closeBrowser();
        return returnValues;
    }
    getInternalCommentsData(creditNote, separator = '#--#') {
        const splitComments = creditNote.internalComments.split(separator);
        const result = {};
        splitComments.forEach(comment => {
            if (comment.includes('##')) {
                comment = comment.replace('##', '');
            }
            if (comment.includes(': ')) {
                const [key, value] = comment.split(': ');
                result[key] = value;
            }
        });
        return result;
    }
    getInternalCommentStr(data, separator = '#--#') {
        return `##${Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(separator)}##`;
    }
}
exports.default = CreditNotes;
